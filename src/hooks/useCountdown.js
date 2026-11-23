import { useEffect, useState } from "react";

const TICK_INTERVAL_MILLIS = 1000;

// expiresAtMillis까지 남은 초를 1초마다 갱신합니다. expiresAtMillis가 없으면 null을 반환합니다.
export function useCountdown(expiresAtMillis) {
    const [nowMillis, setNowMillis] = useState(() => Date.now());

    useEffect(() => {
        if (expiresAtMillis == null) {
            return;
        }
        const timerId = setInterval(() => setNowMillis(Date.now()), TICK_INTERVAL_MILLIS);
        return () => clearInterval(timerId);
    }, [expiresAtMillis]);

    if (expiresAtMillis == null) {
        return null;
    }
    return Math.max(0, Math.ceil((expiresAtMillis - nowMillis) / TICK_INTERVAL_MILLIS));
}
