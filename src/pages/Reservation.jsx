import { useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CalendarDays,
    MapPin,
    Clock3,
    TimerOff,
    MonitorSmartphone,
} from "lucide-react";
import {
    api,
    admissionStore,
    isAdmissionExpiredError,
    isAdmissionInvalidError,
    isQueueTakenOverError,
} from "../api";
import { useResource } from "../hooks/useResource";
import { useCountdown } from "../hooks/useCountdown";
import { formatDate, formatSlotTime, formatCountdown } from "../hooks/format";
import { ResourceStatus } from "../components/UI";
import { EVENT } from "../event";

const URGENT_THRESHOLD_SECONDS = 60;
const LAST_RESERVATION_KEY = "last-reservation";

const getMonthLabel = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", { month: "short" });
const getWeekdayLabel = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", { weekday: "short" });

// 시간대 상태 표시: 예약 가능 또는 예약 마감
function getSlotStatusLabel(slot) {
    return slot.isAvailable ? "예약 가능" : "예약 마감";
}

// isInvalidated: 서버가 403(입장 토큰이 없거나 유효하지 않음)을 준 경우.
// 다른 브라우저로 넘어간 경우와 시간이 지난 경우를 서버 응답만으로 구분할 수 없어 두 이유를 함께 안내합니다.
function AdmissionExpired({ isInvalidated = false }) {
    const navigate = useNavigate();
    const requeue = () => {
        admissionStore.clear();
        navigate("/queue");
    };
    return (
        <main className="container narrow">
            <div className="state">
                <TimerOff size={38} />
                <h2>{isInvalidated ? "입장 권한이 종료되었어요." : "입장 시간이 만료되었어요."}</h2>
                <p className="muted">
                    {isInvalidated
                        ? "다른 브라우저에서 대기를 시작했거나 입장 시간이 지났어요."
                        : "제한 시간 안에 예약을 확정하지 않아 입장 권한이 만료되었습니다."}
                    <br />
                    예약하려면 대기열에 다시 등록해주세요.
                </p>
                <button className="button" onClick={requeue}>
                    대기열 다시 등록
                </button>
                <Link className="text-link" to="/">
                    처음으로
                </Link>
            </div>
        </main>
    );
}

// 다른 브라우저가 대기를 가져가서 이 창의 입장 권한이 종료된 경우
function AdmissionTakenOver() {
    const navigate = useNavigate();
    const leaveTo = (path) => {
        admissionStore.clear();
        navigate(path);
    };
    return (
        <main className="container narrow">
            <div className="state">
                <MonitorSmartphone size={38} />
                <h2>다른 브라우저에서 대기를 시작했어요.</h2>
                <p className="muted">
                    이 창의 예약 권한은 종료되었어요. 대기와 예약은 한 브라우저에서만 할 수 있어요.
                </p>
                <button className="button" onClick={() => leaveTo("/queue")}>
                    이 브라우저에서 다시 대기
                </button>
                <button className="text-link" onClick={() => leaveTo("/")}>
                    처음으로
                </button>
            </div>
        </main>
    );
}

// 1인 1예약: 이미 확정된 예약이 있으면 새로 예약하지 않고 기존 예약을 안내합니다.
function AlreadyReserved({ reservation }) {
    const navigate = useNavigate();
    const leaveTo = (path) => {
        admissionStore.clear();
        navigate(path);
    };
    return (
        <main className="container narrow">
            <div className="state">
                <CalendarDays size={38} />
                <h2>이미 확정된 예약이 있어요.</h2>
                <p className="muted">
                    {formatDate(reservation.startAt)} {formatSlotTime(reservation)} 예약이 있습니다.
                    <br />
                    예약은 1인 1건만 가능해요. 시간을 바꾸려면 기존 예약을 취소한 뒤 다시
                    예약해주세요.
                </p>
                <button className="button" onClick={() => leaveTo("/my")}>
                    마이페이지에서 확인
                </button>
                <button className="text-link" onClick={() => leaveTo("/")}>
                    처음으로
                </button>
            </div>
        </main>
    );
}

export default function Reservation() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 상태 반영 전에 들어오는 연속 클릭을 막습니다.
    const isSubmittingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [, forceRender] = useState(0);
    const [isTakenOverOnCreate, setIsTakenOverOnCreate] = useState(false);
    const [isInvalidatedOnCreate, setIsInvalidatedOnCreate] = useState(false);

    const admission = admissionStore.get();
    const hasAdmission = Boolean(admission?.admissionToken);
    const remainingSeconds = useCountdown(hasAdmission ? admission.expiresAtMillis : null);
    // 예약 화면에 입장한 사용자만 조회하므로 대기열이 조절한 속도로만 요청이 나갑니다.
    const myReservationsResource = useResource(
        () => (hasAdmission ? api.getMyReservations() : Promise.resolve([])),
        [],
    );
    const datesResource = useResource(
        () => (hasAdmission ? api.getAvailableDates() : Promise.resolve([])),
        [],
    );
    const slotsResource = useResource(
        () => (selectedDate ? api.getSlotsByDate(selectedDate) : Promise.resolve([])),
        [selectedDate],
    );

    // 입장 권한 만료: 타이머가 0이 되었거나, 날짜, 시간대 조회 또는 예약 확정에서 서버가 410을 준 경우
    const isExpiredByServer = [datesResource, slotsResource].some((resource) =>
        isAdmissionExpiredError({ status: resource.errorStatus }),
    );
    // 입장 권한 종료: 서버가 403(유효하지 않은 토큰)을 준 경우
    const isInvalidatedByServer =
        isInvalidatedOnCreate ||
        [datesResource, slotsResource].some((resource) =>
            isAdmissionInvalidError({ status: resource.errorStatus }),
        );
    const isTakenOver =
        isTakenOverOnCreate ||
        [myReservationsResource, datesResource, slotsResource].some((resource) =>
            isQueueTakenOverError({ code: resource.errorCode }),
        );
    if (hasAdmission && isTakenOver) {
        return <AdmissionTakenOver />;
    }
    if (hasAdmission && isInvalidatedByServer) {
        return <AdmissionExpired isInvalidated />;
    }
    if (hasAdmission && (remainingSeconds === 0 || isExpiredByServer)) {
        return <AdmissionExpired />;
    }
    const confirmedReservation = myReservationsResource.result?.find(
        (reservation) => reservation.status === "CONFIRMED",
    );
    if (hasAdmission && confirmedReservation) {
        return <AlreadyReserved reservation={confirmedReservation} />;
    }
    if (!hasAdmission) {
        return (
            <main className="container narrow">
                <div className="state">
                    <h2>대기열 입장 후 예약할 수 있어요.</h2>
                    <Link className="button" to="/">
                        처음으로
                    </Link>
                </div>
            </main>
        );
    }

    // 예약 확정에서 만료 응답을 받으면 만료 시각을 0으로 기록해 만료 화면으로 전환합니다.
    const markAdmissionExpired = () => {
        admissionStore.set({ ...admission, expiresAtMillis: 0 });
        forceRender((count) => count + 1);
    };

    const selectDate = (date) => {
        setSelectedDate(date);
        setSelectedSlot(null);
    };

    async function confirmReservation() {
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setErrorMessage("");
        try {
            const reservation = await api.createReservation(selectedSlot.slotId);
            sessionStorage.setItem(LAST_RESERVATION_KEY, JSON.stringify(reservation));
            admissionStore.clear();
            navigate("/reservation/complete", { state: { reservation }, replace: true });
        } catch (error) {
            if (isQueueTakenOverError(error)) {
                setIsTakenOverOnCreate(true);
            } else if (isAdmissionInvalidError(error)) {
                setIsInvalidatedOnCreate(true);
            } else if (isAdmissionExpiredError(error)) {
                markAdmissionExpired();
            } else {
                setErrorMessage(error.message);
                setSelectedSlot(null);
                slotsResource.reload();
            }
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    const dates = datesResource.result;
    const slots = slotsResource.result;
    const isUrgent = remainingSeconds <= URGENT_THRESHOLD_SECONDS;

    return (
        <main className="container reservation">
            <Link className="back" to="/">
                <ArrowLeft size={16} />
                처음으로
            </Link>
            <h1>예약 시간 선택</h1>
            <p className="muted">방문할 날짜와 시간을 선택해주세요.</p>
            <div className={`admission-timer${isUrgent ? " urgent" : ""}`} role="timer">
                <Clock3 size={18} />
                <span>
                    남은 예약 시간 <strong>{formatCountdown(remainingSeconds)}</strong>
                </span>
                <small>
                    시간 안에 예약을 확정하지 않으면 입장 권한이 만료되어 대기열에 다시 서야 해요.
                </small>
            </div>
            <div className="reservation-grid">
                <section className="selection-panel">
                    <h2>
                        <span>01</span>방문 날짜
                    </h2>
                    <ResourceStatus
                        isLoading={datesResource.isLoading}
                        errorMessage={datesResource.errorMessage}
                        isEmpty={dates?.length === 0}
                        onRetry={datesResource.reload}
                    />
                    <div className="date-grid">
                        {dates?.map((dateOption) => (
                            <button
                                key={dateOption.date}
                                disabled={!dateOption.isAvailable}
                                className={selectedDate === dateOption.date ? "selected" : ""}
                                onClick={() => selectDate(dateOption.date)}
                            >
                                <small>{getMonthLabel(dateOption.date)}</small>
                                <strong>{dateOption.date.slice(-2)}</strong>
                                <span>{getWeekdayLabel(dateOption.date)}</span>
                            </button>
                        ))}
                    </div>
                    <h2>
                        <span>02</span>방문 시간
                    </h2>
                    {!selectedDate ? (
                        <p className="selection-hint">먼저 방문 날짜를 선택해주세요.</p>
                    ) : (
                        <>
                            <ResourceStatus
                                isLoading={slotsResource.isLoading}
                                errorMessage={slotsResource.errorMessage}
                                isEmpty={slots?.length === 0}
                                onRetry={slotsResource.reload}
                            />
                            <div className="slot-grid">
                                {slots?.map((slot) => (
                                    <button
                                        key={slot.slotId}
                                        className={
                                            selectedSlot?.slotId === slot.slotId ? "selected" : ""
                                        }
                                        disabled={!slot.isAvailable || isSubmitting}
                                        onClick={() => setSelectedSlot(slot)}
                                    >
                                        <strong>{formatSlotTime(slot)}</strong>
                                        <small>{getSlotStatusLabel(slot)}</small>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    <p className="muted small">
                        방문은 1인 기준입니다. 비활성화된 날짜와 시간은 예약이 마감되었습니다.
                    </p>
                </section>
                <aside className="reservation-summary">
                    <p className="eyebrow">RESERVATION</p>
                    <h2>{EVENT.title}</h2>
                    <p className="muted small">{EVENT.place}</p>
                    <div className="summary-line">
                        <span>방문 날짜</span>
                        <b>{selectedDate ? formatDate(selectedDate) : "날짜 선택"}</b>
                    </div>
                    <div className="summary-line">
                        <span>방문 시간</span>
                        <b>{selectedSlot ? formatSlotTime(selectedSlot) : "시간 선택"}</b>
                    </div>
                    <div className="summary-line">
                        <span>인원</span>
                        <b>1명</b>
                    </div>
                    {errorMessage && (
                        <p className="error" role="alert">
                            {errorMessage}
                        </p>
                    )}
                    <button
                        className="button full"
                        disabled={
                            !selectedSlot ||
                            isSubmitting ||
                            !remainingSeconds ||
                            myReservationsResource.isLoading
                        }
                        onClick={confirmReservation}
                    >
                        {isSubmitting ? "예약 확정 중" : "예약 확정하기"}
                        <ArrowRight size={17} />
                    </button>
                    <p className="small muted">
                        확정한 예약은 마이페이지에서 확인 및 취소할 수 있습니다.
                    </p>
                </aside>
            </div>
        </main>
    );
}

function readLastReservation() {
    try {
        return JSON.parse(sessionStorage.getItem(LAST_RESERVATION_KEY));
    } catch (error) {
        console.warn("저장된 예약 정보를 읽지 못했습니다.", error);
        return null;
    }
}

export function ReservationComplete() {
    const location = useLocation();
    const reservation = location.state?.reservation || readLastReservation();

    return (
        <main className="container complete">
            <div className="round-icon">
                <Check size={30} />
            </div>
            <h1>{reservation ? "예약이 확정되었어요." : "완료된 예약 정보가 없어요."}</h1>
            <p className="muted">
                {reservation
                    ? "방문 당일 이 화면이나 마이페이지의 예약 정보를 보여주세요."
                    : "마이페이지에서 내 예약을 확인해주세요."}
            </p>
            {reservation && (
                <div className="ticket">
                    <span className="eyebrow">RESERVATION CONFIRMED</span>
                    <h2>{EVENT.title}</h2>
                    <p>
                        <CalendarDays size={17} />
                        {formatDate(reservation.startAt)} {formatSlotTime(reservation)}, 1명
                    </p>
                    <p>
                        <MapPin size={17} />
                        {EVENT.place}
                    </p>
                    <div className="ticket-code">
                        <span>예약 번호</span>
                        <b>{reservation.reservationNumber}</b>
                    </div>
                </div>
            )}
            <Link className="button" to="/my">
                마이페이지에서 예약 확인
                <ArrowRight size={17} />
            </Link>
            <Link className="text-link" to="/">
                처음으로
            </Link>
        </main>
    );
}
