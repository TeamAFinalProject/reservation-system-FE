// 백엔드 없이 화면을 확인하기 위한 가짜 서버입니다. 응답 형식은 API 명세({ success, message, data }) 기준입니다.
// 명세처럼 실패 응답에는 code를 넣지 않고 HTTP 상태 코드로만 구분합니다.
import { ADMISSION_TTL_SECONDS } from "../api/storage";

const MOCK_DELAY_MILLIS = 350;
const MILLIS_PER_SECOND = 1000;

// 대기열 시뮬레이션: 내 앞 8명에서 시작해 3초마다 1명씩 입장
const INITIAL_AHEAD_COUNT = 8;
const ADMISSION_INTERVAL_MILLIS = 3000;

// 예약 시간대: 내일부터 7일, 매일 11시~19시 1시간 단위
const BOOKABLE_DAY_COUNT = 7;
const CLOSED_DAY_INDEX = 3;
const SLOT_START_HOURS = [11, 12, 13, 14, 15, 16, 17, 18];
const CLOSED_SLOT_INDEXES = [2, 5];

const ACCOUNTS_KEY = "mock-accounts";
// 사람(username)마다 대기 항목과 입장 기록을 하나씩 둡니다. 둘 다 어느 브라우저의 것인지 browserId를 함께 저장합니다.
const QUEUE_KEY_PREFIX = "mock-queue-";
const ADMISSION_KEY_PREFIX = "mock-admission-";
const RESERVATION_SEQUENCE_KEY = "mock-reservation-seq";
// 예약 번호: 예약한 날짜(YYYYMMDD) + 예약 ID 6자리 (예: 20261201000152)
const RESERVATION_NUMBER_ID_DIGITS = 6;
const ADMISSION_TOKEN_PREFIX = "mock-admission-";
const ACCESS_TOKEN_PREFIX = "mock-";

function readStorage(key, fallbackValue) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallbackValue;
    } catch (error) {
        console.warn(`mock 저장값(${key})을 읽지 못해 기본값을 사용합니다.`, error);
        return fallbackValue;
    }
}

const saveStorage = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const createHttpError = (status, message) => Object.assign(new Error(message), { status });
const padTwoDigits = (number) => String(number).padStart(2, "0");
const formatLocalDate = (date) =>
    `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`;

// 명세의 일시 형식(LocalDateTime, 시간대 없음): "YYYY-MM-DDTHH:mm:ss"
function formatLocalDateTime(date) {
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map(padTwoDigits)
        .join(":");
    return `${formatLocalDate(date)}T${time}`;
}

const createReservationNumber = (reservationId) =>
    `${formatLocalDate(new Date()).replaceAll("-", "")}${String(reservationId).padStart(RESERVATION_NUMBER_ID_DIGITS, "0")}`;

function createMockDates() {
    return Array.from({ length: BOOKABLE_DAY_COUNT }, (_, dayIndex) => {
        const date = new Date();
        date.setDate(date.getDate() + dayIndex + 1);
        return { date: formatLocalDate(date), isAvailable: dayIndex !== CLOSED_DAY_INDEX };
    });
}

function createMockSlots(date) {
    const isDayOpen = createMockDates().find((day) => day.date === date)?.isAvailable ?? false;
    return SLOT_START_HOURS.map((startHour, slotIndex) => ({
        slotId: Number(`${date.replaceAll("-", "")}${padTwoDigits(startHour)}`),
        startAt: `${date}T${padTwoDigits(startHour)}:00:00`,
        endAt: `${date}T${padTwoDigits(startHour + 1)}:00:00`,
        isAvailable: isDayOpen && !CLOSED_SLOT_INDEXES.includes(slotIndex),
    }));
}

// slotId는 "YYYYMMDDHH" 형식의 숫자입니다.
function findSlotById(slotId) {
    const digits = String(slotId);
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return createMockSlots(date).find((slot) => slot.slotId === Number(slotId));
}

// 입장 토큰 검사: 없거나 무효면 403, 만료면 410 (명세 기준).
// 다른 브라우저가 대기를 가져가면 이 브라우저의 토큰은 무효가 되어 403을 받습니다.
function validateAdmissionToken(headers, username) {
    const admissionToken = String(headers["X-Admission-Token"] || "");
    const expiresAtMillis = Number(admissionToken.replace(ADMISSION_TOKEN_PREFIX, ""));
    if (!expiresAtMillis) {
        throw createHttpError(403, "입장 토큰이 없거나 유효하지 않습니다.");
    }
    if (Date.now() > expiresAtMillis) {
        throw createHttpError(410, "입장 토큰이 만료되었습니다.");
    }
    const admissionRecord = readStorage(`${ADMISSION_KEY_PREFIX}${username}`, null);
    if (admissionRecord?.browserId !== headers["X-Browser-Id"]) {
        throw createHttpError(403, "입장 토큰이 없거나 유효하지 않습니다.");
    }
}

function getQueueStatus(username, browserId) {
    const queueKey = `${QUEUE_KEY_PREFIX}${username}`;
    const queueEntry = readStorage(queueKey, null);
    if (!queueEntry) {
        throw createHttpError(404, "대기 정보가 존재하지 않거나 만료되었습니다.");
    }
    if (queueEntry.browserId !== browserId) {
        throw createHttpError(409, "다른 브라우저로 대기열이 이전되었습니다.");
    }
    const elapsedMillis = Date.now() - queueEntry.enteredAtMillis;
    const aheadCount = Math.max(
        0,
        INITIAL_AHEAD_COUNT - Math.floor(elapsedMillis / ADMISSION_INTERVAL_MILLIS),
    );
    const canEnter = aheadCount === 0;
    const admissionExpiresAtMillis =
        queueEntry.enteredAtMillis +
        INITIAL_AHEAD_COUNT * ADMISSION_INTERVAL_MILLIS +
        ADMISSION_TTL_SECONDS * MILLIS_PER_SECOND;
    if (canEnter) {
        // 입장한 사용자는 대기열에서 빠지고, 입장한 브라우저를 기록합니다.
        localStorage.removeItem(queueKey);
        saveStorage(`${ADMISSION_KEY_PREFIX}${username}`, {
            browserId,
            expiresAtMillis: admissionExpiresAtMillis,
        });
    }
    return {
        aheadCount,
        canEnter,
        admissionToken: canEnter ? `${ADMISSION_TOKEN_PREFIX}${admissionExpiresAtMillis}` : null,
        admissionExpiresAt: canEnter
            ? formatLocalDateTime(new Date(admissionExpiresAtMillis))
            : null,
    };
}

// 같은 사람이 다른 브라우저에서 대기 중이거나, 유효한 입장 권한을 가지고 있는지 확인합니다.
function findOtherBrowserHolder(username, browserId) {
    const queueEntry = readStorage(`${QUEUE_KEY_PREFIX}${username}`, null);
    if (queueEntry && queueEntry.browserId !== browserId) {
        return true;
    }
    const admissionRecord = readStorage(`${ADMISSION_KEY_PREFIX}${username}`, null);
    return Boolean(
        admissionRecord &&
        admissionRecord.browserId !== browserId &&
        admissionRecord.expiresAtMillis > Date.now(),
    );
}

const hasConfirmedReservation = (reservations) =>
    reservations.some((reservation) => reservation.status === "CONFIRMED");

// 요청을 처리하고 { message, data }를 돌려줍니다. 실패하면 상태 코드가 담긴 오류를 던집니다.
function handleMockRequest(path, method, body, headers) {
    const username = (headers.Authorization || "").replace(`Bearer ${ACCESS_TOKEN_PREFIX}`, "");
    const reservationsKey = `mock-reservations-${username}`;

    // 인증
    if (path === "/api/auth/signup") {
        const passwordByUsername = readStorage(ACCOUNTS_KEY, {});
        if (passwordByUsername[body.username]) {
            throw createHttpError(409, "이미 존재하는 아이디입니다.");
        }
        passwordByUsername[body.username] = body.password;
        saveStorage(ACCOUNTS_KEY, passwordByUsername);
        return { message: "회원가입이 완료되었습니다.", data: null };
    }
    if (path === "/api/auth/login") {
        const savedPassword = readStorage(ACCOUNTS_KEY, {})[body.username];
        if (savedPassword && savedPassword !== body.password) {
            throw createHttpError(401, "아이디 또는 비밀번호를 확인해주세요.");
        }
        return {
            message: "로그인에 성공했습니다.",
            data: { accessToken: `${ACCESS_TOKEN_PREFIX}${body.username}` },
        };
    }
    if (!username) {
        throw createHttpError(401, "인증되지 않은 사용자입니다.");
    }

    // 대기열 (동일 브라우저 + 동일 인물)
    const browserId = headers["X-Browser-Id"];
    const queueKey = `${QUEUE_KEY_PREFIX}${username}`;
    if (path === "/api/queue/enter") {
        // 1인 1예약: 확정된 예약이 있으면 대기열에 들어갈 수 없습니다 (409).
        if (hasConfirmedReservation(readStorage(reservationsKey, []))) {
            throw createHttpError(409, "이미 예약이 존재합니다.");
        }
        // 다른 브라우저에서 대기 중이면 거절합니다 (409). takeover면 그쪽 대기와 입장 권한을 지우고 이 브라우저로 옮깁니다.
        const isOtherBrowserHolding = findOtherBrowserHolder(username, browserId);
        if (isOtherBrowserHolding && !body?.takeover) {
            throw createHttpError(409, "다른 브라우저에서 이미 대기 중입니다.");
        }
        // reset이 false면 같은 브라우저의 기존 순서를 유지하고, true면 맨 뒤로 다시 등록합니다.
        const existingEntry = readStorage(queueKey, null);
        const canKeepPosition =
            existingEntry?.browserId === browserId && !body?.reset && !isOtherBrowserHolding;
        if (!canKeepPosition) {
            localStorage.removeItem(`${ADMISSION_KEY_PREFIX}${username}`);
            saveStorage(queueKey, { enteredAtMillis: Date.now(), browserId });
        }
        return { message: "대기열에 등록되었습니다.", data: getQueueStatus(username, browserId) };
    }
    if (path === "/api/queue" && method === "DELETE") {
        // 다른 브라우저가 가져간 대기는 지우지 않습니다.
        if (readStorage(queueKey, null)?.browserId === browserId) {
            localStorage.removeItem(queueKey);
        }
        return { message: "대기열 취소가 완료되었습니다.", data: null };
    }
    if (path === "/api/queue/status") {
        return {
            message: "대기열 상태 조회에 성공했습니다.",
            data: getQueueStatus(username, browserId),
        };
    }

    // 예약 시간대와 예약 확정은 입장 토큰이 필요합니다.
    const isCreatingReservation = path === "/api/reservations" && method === "POST";
    if (path.startsWith("/api/slots") || isCreatingReservation) {
        validateAdmissionToken(headers, username);
    }

    if (path === "/api/slots/dates") {
        return {
            message: "예약 가능 날짜 조회에 성공했습니다.",
            data: { dates: createMockDates() },
        };
    }
    if (path.startsWith("/api/slots/")) {
        const date = new URLSearchParams(path.split("?")[1]).get("date");
        return {
            message: "예약 시간대 조회에 성공했습니다.",
            data: { slots: createMockSlots(date) },
        };
    }

    // 예약
    if (path === "/api/reservations/me") {
        return {
            message: "예약 조회에 성공했습니다.",
            data: { reservations: readStorage(reservationsKey, []) },
        };
    }
    if (isCreatingReservation) {
        const reservations = readStorage(reservationsKey, []);
        const slot = findSlotById(body.slotId);
        if (!slot) {
            throw createHttpError(404, "존재하지 않는 예약 시간대입니다.");
        }
        // 1인 1예약: 확정된 예약이 있거나 마감된 시간대면 예약할 수 없습니다 (409).
        if (hasConfirmedReservation(reservations)) {
            throw createHttpError(409, "이미 예약이 존재합니다.");
        }
        if (!slot.isAvailable) {
            throw createHttpError(409, "해당 시간대의 예약이 마감되었습니다.");
        }
        const reservationId = readStorage(RESERVATION_SEQUENCE_KEY, 0) + 1;
        const reservation = {
            reservationId,
            reservationNumber: createReservationNumber(reservationId),
            status: "CONFIRMED",
            startAt: slot.startAt,
            endAt: slot.endAt,
        };
        saveStorage(RESERVATION_SEQUENCE_KEY, reservationId);
        // 입장 권한은 예약 확정으로 사용 완료됩니다.
        localStorage.removeItem(`${ADMISSION_KEY_PREFIX}${username}`);
        saveStorage(reservationsKey, [{ ...reservation, cancelledAt: null }, ...reservations]);
        return { message: "예약이 확정되었습니다.", data: reservation };
    }
    const cancelPathMatch = path.match(/^\/api\/reservations\/(\d+)\/cancel$/);
    if (cancelPathMatch && method === "PATCH") {
        const reservationId = Number(cancelPathMatch[1]);
        const reservations = readStorage(reservationsKey, []);
        const targetReservation = reservations.find(
            (reservation) => reservation.reservationId === reservationId,
        );
        if (!targetReservation) {
            throw createHttpError(404, "존재하지 않는 예약입니다.");
        }
        if (targetReservation.status === "CANCELLED") {
            throw createHttpError(409, "이미 취소된 예약입니다.");
        }
        const cancelledReservation = {
            ...targetReservation,
            status: "CANCELLED",
            cancelledAt: formatLocalDateTime(new Date()),
        };
        saveStorage(
            reservationsKey,
            reservations.map((reservation) =>
                reservation.reservationId === reservationId ? cancelledReservation : reservation,
            ),
        );
        const { reservationNumber, status, cancelledAt } = cancelledReservation;
        return {
            message: "예약이 취소되었습니다.",
            data: { reservationId, reservationNumber, status, cancelledAt },
        };
    }

    throw createHttpError(404, "지원하지 않는 요청입니다.");
}

export async function sendMockRequest(path, method, body = {}, headers = {}) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MILLIS));
    const { message, data } = handleMockRequest(path, method, body, headers);
    return { success: true, message, data };
}
