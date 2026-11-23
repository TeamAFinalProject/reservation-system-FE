const SECONDS_PER_MINUTE = 60;

const padTwoDigits = (number) => String(number).padStart(2, "0");

// "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:mm:ss"(LocalDateTime) 모두 받습니다.
export const formatDate = (dateTime) =>
    new Date(`${dateTime.slice(0, 10)}T12:00:00`).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
    });

// LocalDateTime 문자열에서 "HH:mm"만 꺼냅니다.
export const formatTime = (dateTime) => dateTime.slice(11, 16);

export const formatSlotTime = (slot) => `${formatTime(slot.startAt)} ~ ${formatTime(slot.endAt)}`;

// 남은 초를 "MM:SS"로 표시합니다.
export const formatCountdown = (seconds) =>
    `${padTwoDigits(Math.floor(seconds / SECONDS_PER_MINUTE))}:${padTwoDigits(seconds % SECONDS_PER_MINUTE)}`;
