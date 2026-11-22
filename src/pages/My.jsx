import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Ticket, MapPin } from "lucide-react";
import { api } from "../api";
import { useResource } from "../hooks/useResource";
import { formatDate, formatSlotTime, formatTime } from "../hooks/format";
import { Modal, ResourceStatus } from "../components/UI";
import { EVENT } from "../event";

const ReservationStatus = { CONFIRMED: "CONFIRMED", CANCELLED: "CANCELLED" };
const STATUS_TABS = [
    { status: ReservationStatus.CONFIRMED, label: "방문 예정" },
    { status: ReservationStatus.CANCELLED, label: "취소한 예약" },
];

export default function My() {
    const reservationsResource = useResource(() => api.getMyReservations());
    const [cancelTarget, setCancelTarget] = useState(null);
    const [isCancelling, setIsCancelling] = useState(false);
    // 상태 반영 전에 들어오는 연속 클릭을 막습니다.
    const isCancellingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedStatus, setSelectedStatus] = useState(ReservationStatus.CONFIRMED);

    async function confirmCancel() {
        if (isCancellingRef.current) {
            return;
        }
        isCancellingRef.current = true;
        setIsCancelling(true);
        setErrorMessage("");
        try {
            await api.cancelReservation(cancelTarget.reservationId);
            setCancelTarget(null);
            reservationsResource.reload();
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            isCancellingRef.current = false;
            setIsCancelling(false);
        }
    }

    const openCancelModal = (reservation) => {
        setErrorMessage("");
        setCancelTarget(reservation);
    };

    const reservations = reservationsResource.result || [];
    const countByStatus = (status) =>
        reservations.filter((reservation) => reservation.status === status).length;
    const visibleReservations = reservations.filter(
        (reservation) => reservation.status === selectedStatus,
    );
    const isConfirmedTab = selectedStatus === ReservationStatus.CONFIRMED;
    const isListEmpty =
        !reservationsResource.isLoading &&
        !reservationsResource.errorMessage &&
        visibleReservations.length === 0;

    return (
        <main className="container my-page">
            <h1>내 예약</h1>
            <p className="muted">예약 내역을 확인하고 취소할 수 있어요.</p>
            <div className="my-tabs">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.status}
                        className={selectedStatus === tab.status ? "active" : ""}
                        onClick={() => setSelectedStatus(tab.status)}
                    >
                        {tab.label}
                        <span>{countByStatus(tab.status)}</span>
                    </button>
                ))}
            </div>
            <ResourceStatus
                isLoading={reservationsResource.isLoading}
                errorMessage={reservationsResource.errorMessage}
                onRetry={reservationsResource.reload}
            />
            {isListEmpty && (
                <div className="empty">
                    <Ticket size={38} />
                    <h2>{isConfirmedTab ? "예정된 예약이 없어요." : "취소한 예약이 없어요."}</h2>
                    {isConfirmedTab && (
                        <Link className="button" to="/">
                            예약하러 가기
                            <ArrowRight size={18} />
                        </Link>
                    )}
                </div>
            )}
            <div className="my-list">
                {visibleReservations.map((reservation) => {
                    const isCancelled = reservation.status === ReservationStatus.CANCELLED;
                    return (
                        <article className="reservation-card" key={reservation.reservationId}>
                            <div className="reservation-card-content">
                                <span className={`pill ${isCancelled ? "cancelled" : ""}`}>
                                    {isCancelled ? "취소 완료" : "예약 확정"}
                                </span>
                                <h2>{EVENT.title}</h2>
                                <p>
                                    <CalendarDays size={15} />
                                    {formatDate(reservation.startAt)} {formatSlotTime(reservation)},
                                    1명
                                </p>
                                <p>
                                    <MapPin size={15} />
                                    {EVENT.place}
                                </p>
                                <small>
                                    예약 번호 {reservation.reservationNumber}
                                    {isCancelled && reservation.cancelledAt
                                        ? `, ${formatDate(reservation.cancelledAt)} ${formatTime(reservation.cancelledAt)} 취소`
                                        : ""}
                                </small>
                            </div>
                            {!isCancelled && (
                                <div className="reservation-actions">
                                    <button onClick={() => openCancelModal(reservation)}>
                                        예약 취소
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
            {cancelTarget && (
                <Modal
                    title="예약 취소 확인"
                    onClose={() => !isCancelling && setCancelTarget(null)}
                >
                    <div className="round-icon">
                        <Ticket />
                    </div>
                    <h2>예약을 취소할까요?</h2>
                    <p className="muted">
                        {formatDate(cancelTarget.startAt)} {formatSlotTime(cancelTarget)} 예약이
                        취소됩니다.
                        <br />
                        다시 방문하려면 대기열을 거쳐 새로 예약해야 해요.
                    </p>
                    {errorMessage && (
                        <p className="error" role="alert">
                            {errorMessage}
                        </p>
                    )}
                    <div className="modal-buttons">
                        <button
                            className="button secondary"
                            disabled={isCancelling}
                            onClick={() => setCancelTarget(null)}
                        >
                            예약 유지
                        </button>
                        <button className="button" disabled={isCancelling} onClick={confirmCancel}>
                            {isCancelling ? "취소 중" : "예약 취소"}
                        </button>
                    </div>
                </Modal>
            )}
        </main>
    );
}
