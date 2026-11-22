// 브라우저 저장소 헬퍼. 대기열과 입장 권한은 탭 단위(sessionStorage)로 관리합니다.
// 새로고침해도 sessionStorage는 남아 있으므로 "이전 대기 기록"으로 새로고침을 감지할 수 있습니다.

const ACCESS_TOKEN_KEY = "access-token";
const QUEUE_ENTRY_KEY = "queue-entry";
const ADMISSION_KEY = "admission";
const MILLIS_PER_SECOND = 1000;

// 입장 권한 유효 시간(초). 서버가 admissionExpiresAt을 주지 않을 때만 사용하는 기본값입니다.
export const ADMISSION_TTL_SECONDS = Number(import.meta.env.VITE_ADMISSION_TTL_SECONDS) || 300;

function readJson(storage, key) {
    try {
        return JSON.parse(storage.getItem(key));
    } catch (error) {
        console.warn(`저장된 값(${key})을 읽지 못해 무시합니다.`, error);
        return null;
    }
}

export const queueStore = {
    get: () => readJson(sessionStorage, QUEUE_ENTRY_KEY),
    set: (queueEntry) => sessionStorage.setItem(QUEUE_ENTRY_KEY, JSON.stringify(queueEntry)),
    clear: () => sessionStorage.removeItem(QUEUE_ENTRY_KEY),
};

export const admissionStore = {
    get: () => readJson(sessionStorage, ADMISSION_KEY),
    set: (admission) => sessionStorage.setItem(ADMISSION_KEY, JSON.stringify(admission)),
    clear: () => sessionStorage.removeItem(ADMISSION_KEY),
    // 대기열 상태 응답에서 입장 권한 만료 시각(ms)을 계산합니다.
    getExpiresAtMillis: (queueStatus) =>
        queueStatus.admissionExpiresAt
            ? Date.parse(queueStatus.admissionExpiresAt)
            : Date.now() + ADMISSION_TTL_SECONDS * MILLIS_PER_SECOND,
    isValid: (admission) =>
        Boolean(admission?.admissionToken) && admission.expiresAtMillis > Date.now(),
};

// 브라우저 ID: 같은 브라우저의 모든 탭이 공유하고, 다른 브라우저나 기기와는 공유하지 않습니다.
// 서버는 로그인한 사람(memberId)과 이 ID를 함께 보고 "동일 브라우저 + 동일 인물"을 판단합니다.
const BROWSER_ID_KEY = "browser-id";
// mock 모드에서 한 브라우저로 "다른 브라우저"를 흉내 내기 위한 탭 단위 값 (주소에 ?mockBrowser=B)
const MOCK_BROWSER_ID_KEY = "mock-browser-id";

function readMockBrowserId() {
    if (import.meta.env.VITE_USE_MOCK !== "true") {
        return null;
    }
    const mockBrowserParam = new URLSearchParams(window.location.search).get("mockBrowser");
    if (mockBrowserParam) {
        sessionStorage.setItem(MOCK_BROWSER_ID_KEY, `mock-${mockBrowserParam}`);
    }
    return sessionStorage.getItem(MOCK_BROWSER_ID_KEY);
}

export const browserStore = {
    getBrowserId: () => {
        const mockBrowserId = readMockBrowserId();
        if (mockBrowserId) {
            return mockBrowserId;
        }
        let browserId = localStorage.getItem(BROWSER_ID_KEY);
        if (!browserId) {
            browserId = crypto.randomUUID();
            localStorage.setItem(BROWSER_ID_KEY, browserId);
        }
        return browserId;
    },
};

export const tokenStore = {
    get: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    set: (accessToken) => localStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
    clear: () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        queueStore.clear();
        admissionStore.clear();
    },
};
