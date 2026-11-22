import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { admissionStore } from "../api";
import { EVENT } from "../event";

export default function Event() {
    const navigate = useNavigate();
    // 유효한 입장 권한이 있으면 바로 예약 화면, 없으면 대기실로 이동합니다.
    const goToReservation = () => {
        const hasValidAdmission = admissionStore.isValid(admissionStore.get());
        navigate(hasValidAdmission ? "/reservation" : "/queue");
    };

    return (
        <main className="container event">
            <section className="event-card">
                <p className="eyebrow">RESERVATION</p>
                <h1>{EVENT.title}</h1>
                <p className="muted">{EVENT.description}</p>
                <div className="info-list">
                    <p>
                        <CalendarDays size={18} />
                        <span>
                            <small>운영 기간</small>
                            {EVENT.period}
                        </span>
                    </p>
                    <p>
                        <Clock3 size={18} />
                        <span>
                            <small>운영 시간</small>
                            {EVENT.hours}
                        </span>
                    </p>
                    <p>
                        <MapPin size={18} />
                        <span>
                            <small>장소</small>
                            {EVENT.place}
                        </span>
                    </p>
                </div>
                <button className="button full" onClick={goToReservation}>
                    예약하기
                    <ArrowRight size={18} />
                </button>
                <p className="booking-note">
                    예약하기를 누르면 대기실로 이동하고, 차례가 되면 예약 화면에 입장합니다.
                </p>
            </section>
            <section className="event-card">
                <h2>예약 안내</h2>
                <ol className="event-steps">
                    <li>
                        <b>대기실</b>에서 내 앞 대기 인원을 확인합니다.
                    </li>
                    <li>
                        차례가 되면 <b>예약 화면으로 자동 이동</b>합니다. 대기 중 새로고침하면 맨
                        뒤로 이동해요.
                    </li>
                    <li>
                        입장 후 <b>제한 시간 안에</b> 날짜와 시간을 골라 예약을 확정하세요.
                    </li>
                </ol>
                <h2>방문 전 확인해주세요</h2>
                <ul className="event-notices">
                    {EVENT.notices.map((notice) => (
                        <li key={notice}>{notice}</li>
                    ))}
                </ul>
                <Link className="text-link" to="/my">
                    내 예약 확인하기
                </Link>
            </section>
        </main>
    );
}
