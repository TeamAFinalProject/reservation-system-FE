import { browserStore } from "./storage";

// 같은 브라우저의 탭끼리 "대기를 시작했다"는 신호를 주고받습니다.
// 같은 브라우저 + 같은 사람의 대기는 하나만 유지해야 하므로, 새 탭이 대기를 시작하면 기존 탭의 대기를 끝냅니다.
const CHANNEL_NAME = "queue-tabs";
const QUEUE_STARTED = "QUEUE_STARTED";
const TAB_ID = crypto.randomUUID();

const isChannelSupported = () => typeof BroadcastChannel !== "undefined";

export function announceQueueStarted() {
    if (!isChannelSupported()) {
        return;
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({
        type: QUEUE_STARTED,
        tabId: TAB_ID,
        browserId: browserStore.getBrowserId(),
    });
    channel.close();
}

// 같은 브라우저의 다른 탭이 대기를 시작하면 onOtherTabStarted를 호출합니다. 구독 해제 함수를 반환합니다.
export function subscribeOtherTabQueueStarted(onOtherTabStarted) {
    if (!isChannelSupported()) {
        return () => {};
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
        const message = event.data;
        const isFromOtherTab = message?.tabId !== TAB_ID;
        // mock에서 ?mockBrowser로 "다른 브라우저"를 흉내 낸 탭은 같은 브라우저로 보지 않습니다.
        const isSameBrowser = message?.browserId === browserStore.getBrowserId();
        if (message?.type === QUEUE_STARTED && isFromOtherTab && isSameBrowser) {
            onOtherTabStarted();
        }
    };
    return () => channel.close();
}
