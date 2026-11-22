import { api } from "./index";
import { queueStore } from "./storage";

// 대기 정보가 서버에 없다는 뜻으로 보는 응답 코드
const QUEUE_GONE_STATUSES = [404, 410];

export const isQueueGoneError = (error) => QUEUE_GONE_STATUSES.includes(error?.status);

// 대기실 페이지와 서버 대기열 등록을 1:1로 묶는 모듈입니다.
// - 대기실에 들어오면 POST /api/queue/enter로 등록합니다. reset이 true면 기존 순서를 버리고 맨 뒤로 갑니다.
// - takeover가 true면 다른 브라우저의 대기를 취소하고 이 브라우저로 옮깁니다.
// - 대기실을 벗어나면 DELETE /api/queue로 이탈합니다. 입장했거나 다른 탭, 브라우저로 대기가 넘어간 경우는 제외합니다.
// 이탈 요청은 한 틱 늦게 보냅니다. React StrictMode가 effect를 "실행, 정리, 재실행"할 때
// 같은 세션을 재사용해서 등록/이탈 요청이 중복으로 나가지 않게 하기 위함입니다.
let currentSession = null;

// attemptKey: 화면에서 "다시 대기"할 때마다 바뀌는 값. 같은 시도일 때만 세션을 재사용합니다.
export function enterQueueSession({ attemptKey = 0, takeover = false, reset = false } = {}) {
    const canReuse =
        currentSession?.leaveTimerId &&
        !currentSession.failed &&
        currentSession.attemptKey === attemptKey;
    if (canReuse) {
        clearTimeout(currentSession.leaveTimerId);
        currentSession.leaveTimerId = null;
        return currentSession;
    }
    if (currentSession?.leaveTimerId) {
        // 이전 시도의 세션은 이탈 요청 없이 정리합니다. 바로 새로 등록하면 서버에서 맨 뒤로 재배치됩니다.
        clearTimeout(currentSession.leaveTimerId);
    }

    const session = {
        attemptKey,
        leaveTimerId: null,
        admitted: false,
        handedOver: false,
        failed: false,
    };
    session.enterPromise = api.enterQueue({ takeover, reset }).then(
        (queueStatus) => {
            queueStore.set({ enteredAtMillis: Date.now() });
            return queueStatus;
        },
        (error) => {
            session.failed = true;
            throw error;
        },
    );
    currentSession = session;
    return session;
}

export function exitQueueSession(session) {
    session.leaveTimerId = setTimeout(() => {
        if (currentSession === session) {
            currentSession = null;
        }
        // 입장했거나 다른 탭, 브라우저가 대기를 가져간 경우 이탈 요청을 보내면 그쪽 대기가 지워집니다.
        if (session.admitted || session.handedOver) {
            return;
        }
        queueStore.clear();
        if (session.failed) {
            return;
        }
        session.enterPromise
            .then(() => api.leaveQueue())
            .catch((error) => {
                // 이미 만료된 대기열 등 이탈 실패는 화면 동작에 영향이 없어 기록만 남깁니다.
                console.warn("대기열 이탈 요청에 실패했습니다.", error);
            });
    }, 0);
}
