import { sendMockRequest } from "../mocks";
import { tokenStore, admissionStore, browserStore } from "./storage";

export { tokenStore, queueStore, admissionStore, ADMISSION_TTL_SECONDS } from "./storage";

// 서버가 { code }로 알려주는 오류 종류. 현재 API 명세에는 code 필드가 없어 상태 코드로 대신 판단합니다 (BE와 확정 필요)
export const ErrorCode = {
    // 같은 사람이 다른 브라우저에서 이미 대기 중이거나 예약 화면에 입장해 있음
    QUEUE_IN_OTHER_BROWSER: "QUEUE_IN_OTHER_BROWSER",
    // 다른 브라우저가 대기를 가져가서 이 브라우저의 대기, 입장 권한이 종료됨
    QUEUE_TAKEN_OVER: "QUEUE_TAKEN_OVER",
};

const DEFAULT_ERROR_MESSAGE = "요청을 처리하지 못했습니다. 다시 시도해주세요.";
// 입장 토큰 오류 (API 명세): 410은 만료, 403은 없거나 유효하지 않음(다른 브라우저로 넘어간 경우 포함)
const ADMISSION_EXPIRED_STATUS = 410;
const ADMISSION_INVALID_STATUS = 403;

// 모든 API 요청이 거치는 함수입니다.
// - 로그인 토큰: Authorization: Bearer <accessToken>
// - 브라우저 ID: X-Browser-Id: <browserId> (동일 브라우저 + 동일 인물 판단용)
// - 입장 토큰(requiresAdmission이 true인 요청만): X-Admission-Token: <admissionToken>
// - 서버 응답은 { success, message, data } 형식이며, 성공하면 data만 돌려줍니다.
// - 실패 시 서버의 { message }를 error.message로, { code }를 error.code로, HTTP 상태 코드를 error.status로 전달합니다.
async function sendRequest(path, { method = "GET", body, requiresAdmission = false } = {}) {
    const headers = {
        "Content-Type": "application/json",
        "X-Browser-Id": browserStore.getBrowserId(),
    };
    const accessToken = tokenStore.get();
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    if (requiresAdmission) {
        const admission = admissionStore.get();
        if (admission?.admissionToken) {
            headers["X-Admission-Token"] = admission.admissionToken;
        }
    }
    if (import.meta.env.VITE_USE_MOCK === "true") {
        const mockResponseBody = await sendMockRequest(path, method, body, headers);
        return mockResponseBody.data;
    }

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw Object.assign(new Error(responseBody.message || DEFAULT_ERROR_MESSAGE), {
            status: response.status,
            code: responseBody.code,
        });
    }
    return responseBody.data;
}

const CONFLICT_STATUS = 409;

export const isAdmissionExpiredError = (error) => error?.status === ADMISSION_EXPIRED_STATUS;
export const isAdmissionInvalidError = (error) => error?.status === ADMISSION_INVALID_STATUS;
// 대기열 진입의 409는 "다른 브라우저에서 대기 중" 또는 "이미 예약 있음"입니다.
// code가 오면 그것으로 구분하고, code가 없으면 다른 브라우저로 보고 이동 확인을 띄웁니다.
export const isQueueInOtherBrowserError = (error) =>
    error?.code === ErrorCode.QUEUE_IN_OTHER_BROWSER ||
    (error?.status === CONFLICT_STATUS && !error?.code);
// 대기 상태 조회의 409는 "다른 브라우저로 대기열이 이전됨" 하나뿐이라 상태 코드로 판단합니다.
export const isQueueMovedOnStatusError = (error) =>
    error?.code === ErrorCode.QUEUE_TAKEN_OVER || error?.status === CONFLICT_STATUS;
// 예약 화면 API는 다른 브라우저로 넘어가면 현재 명세상 403(유효하지 않은 토큰)을 줍니다.
// BE가 code를 주는 경우에만 "다른 브라우저" 안내를 따로 보여줍니다.
export const isQueueTakenOverError = (error) => error?.code === ErrorCode.QUEUE_TAKEN_OVER;

export const api = {
    // 인증
    signup: ({ username, password }) =>
        sendRequest("/api/auth/signup", { method: "POST", body: { username, password } }),
    login: ({ username, password }) =>
        sendRequest("/api/auth/login", { method: "POST", body: { username, password } }),

    // 대기열 (로그인 토큰 + 브라우저 ID로 식별)
    // takeover: 다른 브라우저의 대기를 취소하고 이 브라우저로 옮김
    // reset: 기존 순서를 버리고 맨 뒤로 다시 등록 (false면 서버가 기존 순서를 유지)
    enterQueue: ({ takeover = false, reset = false } = {}) =>
        sendRequest("/api/queue/enter", { method: "POST", body: { takeover, reset } }),
    getQueueStatus: () => sendRequest("/api/queue/status"),
    leaveQueue: () => sendRequest("/api/queue", { method: "DELETE" }),

    // 예약 시간대 (입장 토큰 필요). 목록은 data 안의 키(dates, slots)에 있습니다.
    getAvailableDates: () =>
        sendRequest("/api/slots/dates", { requiresAdmission: true }).then((data) => data.dates),
    getSlotsByDate: (date) =>
        sendRequest(`/api/slots/?date=${date}`, { requiresAdmission: true }).then(
            (data) => data.slots,
        ),

    // 예약
    createReservation: (slotId) =>
        sendRequest("/api/reservations", {
            method: "POST",
            body: { slotId },
            requiresAdmission: true,
        }),
    getMyReservations: () => sendRequest("/api/reservations/me").then((data) => data.reservations),
    cancelReservation: (reservationId) =>
        sendRequest(`/api/reservations/${reservationId}/cancel`, { method: "PATCH" }),
};
