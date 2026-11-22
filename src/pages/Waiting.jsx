import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, Clock3, MonitorSmartphone, RotateCcw } from "lucide-react";
import {
    api,
    admissionStore,
    queueStore,
    isQueueInOtherBrowserError,
    isQueueMovedOnStatusError,
} from "../api";
import { enterQueueSession, exitQueueSession, isQueueGoneError } from "../api/queueSession";
import { announceQueueStarted, subscribeOtherTabQueueStarted } from "../api/tabChannel";
import { Modal } from "../components/UI";
import { EVENT } from "../event";

const POLLING_INTERVAL_MILLIS = 3000;

// 대기실 화면 상태
const PageState = {
    WAITING: "WAITING",
    // 같은 사람이 다른 브라우저에서 대기 중: 이 브라우저로 옮길지 확인
    IN_OTHER_BROWSER: "IN_OTHER_BROWSER",
    // 같은 브라우저의 다른 탭이 대기를 시작해서 이 탭의 대기가 끝남
    ENDED_BY_OTHER_TAB: "ENDED_BY_OTHER_TAB",
    // 다른 브라우저가 대기를 가져가서 이 창의 대기가 끝남
    ENDED_BY_OTHER_BROWSER: "ENDED_BY_OTHER_BROWSER",
    // 서버에 대기 정보가 없음 (만료, 삭제)
    QUEUE_GONE: "QUEUE_GONE",
    // 1인 1예약: 이미 확정된 예약이 있어 대기열에 들어갈 수 없음
    ALREADY_RESERVED: "ALREADY_RESERVED",
};

// 대기열 진입 409는 "다른 브라우저에서 대기 중"과 "이미 예약 있음"이 같은 상태 코드로 옵니다.
// 명세에 구분 필드가 없어 내 예약을 조회해서 확정된 예약이 있는지로 구분합니다.
async function findHasConfirmedReservation() {
    try {
        const reservations = await api.getMyReservations();
        return reservations.some((reservation) => reservation.status === "CONFIRMED");
    } catch (error) {
        console.warn("기존 예약을 확인하지 못해 다른 브라우저 대기로 안내합니다.", error);
        return false;
    }
}

function QueueNotice({ icon, title, description, actionLabel, onAction }) {
    return (
        <div className="state">
            {icon}
            <h2>{title}</h2>
            <p className="muted">{description}</p>
            <button className="button" onClick={onAction}>
                {actionLabel}
            </button>
            <Link className="text-link" to="/" replace>
                처음으로
            </Link>
        </div>
    );
}

export default function Waiting() {
    const navigate = useNavigate();
    const [pageState, setPageState] = useState(PageState.WAITING);
    const [queueStatus, setQueueStatus] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    // 대기 시도 정보. 바뀔 때마다 대기열에 새로 등록합니다.
    const [attempt, setAttempt] = useState({ count: 0, takeover: false });
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    // 이 탭에 대기 기록이 남아 있다면 새로고침으로 다시 들어온 것입니다. 이때는 맨 뒤로 다시 등록됩니다.
    const [isRejoined] = useState(() => queueStore.get() !== null);

    // 아직 유효한 입장 권한이 있으면 다시 줄 서지 않고 예약 화면으로 보냅니다.
    const hasValidAdmission = admissionStore.isValid(admissionStore.get());
    useEffect(() => {
        if (hasValidAdmission) {
            navigate("/reservation", { replace: true });
        }
    }, [hasValidAdmission, navigate]);

    // 대기열 등록 후 주기적으로 상태를 조회합니다. 페이지를 벗어나면 대기열 이탈을 요청합니다.
    useEffect(() => {
        if (hasValidAdmission) {
            return;
        }
        // 같은 브라우저의 다른 탭에 대기를 시작했다고 알립니다. 그 탭의 대기는 끝나고 이 탭만 남습니다.
        announceQueueStarted();
        // 대기실에 들어올 때마다 맨 뒤로 다시 등록합니다 (새로고침, 새 탭, 화면의 "다시 대기" 모두).
        const session = enterQueueSession({
            attemptKey: attempt.count,
            takeover: attempt.takeover,
            reset: true,
        });
        let isActive = true;
        let isPolling = false;
        let pollingTimerId;

        // 다른 탭, 브라우저로 대기가 넘어간 경우: 조회를 멈추고, 화면을 떠나도 이탈 요청을 보내지 않습니다.
        const endByHandOver = (nextPageState) => {
            session.handedOver = true;
            clearInterval(pollingTimerId);
            queueStore.clear();
            setPageState(nextPageState);
        };

        const unsubscribeOtherTab = subscribeOtherTabQueueStarted(() => {
            if (isActive) {
                endByHandOver(PageState.ENDED_BY_OTHER_TAB);
            }
        });

        const admitToReservation = (nextStatus) => {
            session.admitted = true;
            queueStore.clear();
            admissionStore.set({
                admissionToken: nextStatus.admissionToken,
                expiresAtMillis: admissionStore.getExpiresAtMillis(nextStatus),
            });
            navigate("/reservation", { replace: true });
        };

        const pollQueueStatus = async () => {
            if (isPolling) {
                return;
            }
            isPolling = true;
            try {
                const nextStatus = await api.getQueueStatus();
                if (!isActive) {
                    return;
                }
                setErrorMessage("");
                if (nextStatus.canEnter) {
                    admitToReservation(nextStatus);
                } else {
                    setQueueStatus(nextStatus);
                }
            } catch (error) {
                if (!isActive) {
                    return;
                }
                if (isQueueMovedOnStatusError(error)) {
                    endByHandOver(PageState.ENDED_BY_OTHER_BROWSER);
                } else if (isQueueGoneError(error)) {
                    clearInterval(pollingTimerId);
                    setPageState(PageState.QUEUE_GONE);
                } else {
                    setErrorMessage(error.message);
                }
            } finally {
                isPolling = false;
            }
        };

        session.enterPromise
            .then((enteredStatus) => {
                if (!isActive) {
                    return;
                }
                if (enteredStatus.canEnter) {
                    admitToReservation(enteredStatus);
                    return;
                }
                setQueueStatus(enteredStatus);
                pollingTimerId = setInterval(pollQueueStatus, POLLING_INTERVAL_MILLIS);
            })
            .catch(async (error) => {
                if (!isActive) {
                    return;
                }
                // 옮기기(takeover)를 했는데도 409면 다른 이유이므로 서버 문구를 보여줍니다.
                if (!isQueueInOtherBrowserError(error) || attempt.takeover) {
                    setErrorMessage(error.message);
                    return;
                }
                const hasConfirmedReservation = await findHasConfirmedReservation();
                if (isActive) {
                    setPageState(
                        hasConfirmedReservation
                            ? PageState.ALREADY_RESERVED
                            : PageState.IN_OTHER_BROWSER,
                    );
                }
            });

        return () => {
            isActive = false;
            clearInterval(pollingTimerId);
            unsubscribeOtherTab();
            exitQueueSession(session);
        };
    }, [attempt, hasValidAdmission, navigate]);

    const isWaiting = pageState === PageState.WAITING;

    // 대기 중 새로고침이나 창 닫기를 시도하면 브라우저 확인창을 띄웁니다.
    useEffect(() => {
        if (!isWaiting) {
            return;
        }
        const warnBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeUnload);
        return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    }, [isWaiting]);

    // takeover가 true면 다른 브라우저의 대기를 취소하고 이 브라우저에서 새로 대기합니다.
    const startNewAttempt = ({ takeover = false } = {}) => {
        setQueueStatus(null);
        setErrorMessage("");
        setPageState(PageState.WAITING);
        setAttempt((previousAttempt) => ({ count: previousAttempt.count + 1, takeover }));
    };

    const aheadCount = queueStatus?.aheadCount;

    const noticeByPageState = {
        [PageState.IN_OTHER_BROWSER]: {
            icon: <MonitorSmartphone size={38} />,
            title: "다른 브라우저에서 대기 중이에요.",
            description:
                "이 브라우저에서 새로 대기하면 기존 대기는 취소되고 대기열 맨 뒤에서 시작해요.",
            actionLabel: "이 브라우저에서 새로 대기",
            onAction: () => startNewAttempt({ takeover: true }),
        },
        [PageState.ENDED_BY_OTHER_TAB]: {
            icon: <MonitorSmartphone size={38} />,
            title: "다른 탭에서 대기를 시작했어요.",
            description:
                "같은 브라우저에서는 대기를 하나만 유지해요. 이 탭에서 다시 대기하면 맨 뒤에서 시작해요.",
            actionLabel: "이 탭에서 다시 대기",
            onAction: () => startNewAttempt(),
        },
        [PageState.ENDED_BY_OTHER_BROWSER]: {
            icon: <MonitorSmartphone size={38} />,
            title: "다른 브라우저에서 대기를 시작했어요.",
            description: "이 창의 대기는 종료되었어요. 대기는 한 브라우저에서만 할 수 있어요.",
            actionLabel: "이 브라우저에서 다시 대기",
            onAction: () => startNewAttempt(),
        },
        [PageState.QUEUE_GONE]: {
            icon: <RotateCcw size={38} />,
            title: "대기 정보가 만료되었어요.",
            description: "다시 줄을 서면 대기열 맨 뒤에서 시작합니다.",
            actionLabel: "다시 대기하기",
            onAction: () => startNewAttempt(),
        },
        [PageState.ALREADY_RESERVED]: {
            icon: <CalendarDays size={38} />,
            title: "이미 확정된 예약이 있어요.",
            description:
                "예약은 1인 1건만 가능해요. 시간을 바꾸려면 기존 예약을 취소한 뒤 다시 예약해주세요.",
            actionLabel: "마이페이지에서 확인",
            onAction: () => navigate("/my"),
        },
    };
    const notice = noticeByPageState[pageState];

    return (
        <div className="waiting-layout">
            <header className="waiting-header">
                <span className="logo">
                    popup<span>day</span>
                </span>
                {isWaiting && (
                    <span className="waiting-live">
                        <span className="live-dot" />
                        실시간 대기 중
                    </span>
                )}
            </header>
            <main className="waiting">
                <div className="round-icon">
                    <Clock3 />
                </div>
                <p className="eyebrow">WAITING ROOM</p>
                <h1>{EVENT.title} 대기실</h1>
                <p className="muted">순서대로 예약 화면에 입장합니다. 이 화면을 유지해주세요.</p>
                {isRejoined && attempt.count === 0 && isWaiting && (
                    <p className="success-note" role="status">
                        새로고침하여 대기열 맨 뒤로 다시 등록되었어요.
                    </p>
                )}

                {notice ? (
                    <QueueNotice {...notice} />
                ) : (
                    <>
                        <div className="queue-number">
                            <span>내 앞 남은 인원</span>
                            <strong>
                                {aheadCount ?? "-"}
                                <small>명</small>
                            </strong>
                        </div>
                        {errorMessage && (
                            <p className="error" role="alert">
                                {errorMessage}
                                {queueStatus ? " 3초 후 다시 확인합니다." : ""}
                            </p>
                        )}
                        {errorMessage && !queueStatus && (
                            <button className="button secondary" onClick={() => startNewAttempt()}>
                                <RotateCcw size={16} />
                                다시 시도
                            </button>
                        )}
                    </>
                )}

                <ul className="waiting-guide">
                    <li>
                        차례가 되면 예약 화면으로 <b>자동 이동</b>합니다.
                    </li>
                    <li>
                        입장 후 <b>제한 시간 안에</b> 예약을 확정하지 않으면 입장 권한이 만료됩니다.
                    </li>
                    <li>
                        <b>새로고침하면 대기열 맨 뒤로 이동</b>합니다.
                    </li>
                    <li>
                        대기는 <b>한 브라우저, 한 탭</b>에서만 유지됩니다. 다른 탭이나 브라우저에서
                        대기를 시작하면 이 창의 대기는 종료돼요.
                    </li>
                    <li>대기를 취소하거나 이 화면을 벗어나면 대기가 취소됩니다.</li>
                </ul>
                {isWaiting && (
                    <button className="text-link" onClick={() => setIsLeaveModalOpen(true)}>
                        대기 취소
                    </button>
                )}
            </main>
            {isLeaveModalOpen && (
                <Modal title="대기 취소 확인" onClose={() => setIsLeaveModalOpen(false)}>
                    <h2>대기를 취소할까요?</h2>
                    <p className="muted">다시 예약하려면 대기열 맨 뒤에서 다시 기다려야 해요.</p>
                    <div className="modal-buttons">
                        <button
                            className="button secondary"
                            onClick={() => setIsLeaveModalOpen(false)}
                        >
                            계속 기다리기
                        </button>
                        <button className="button" onClick={() => navigate("/", { replace: true })}>
                            대기 취소
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
