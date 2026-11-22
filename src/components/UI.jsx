import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";

const FOCUSABLE_SELECTOR = 'button, a, input, [tabindex="0"]';

export function Logo() {
    return (
        <Link className="logo" to="/">
            popup<span>day</span>
        </Link>
    );
}

// 조회 중, 실패, 빈 결과 상태를 공통 형식으로 보여줍니다. 해당 상태가 아니면 아무것도 그리지 않습니다.
export function ResourceStatus({ isLoading, errorMessage, isEmpty, onRetry }) {
    if (isLoading) {
        return (
            <div className="state" role="status">
                <span className="spinner" />
                잠시만 기다려주세요.
            </div>
        );
    }
    if (errorMessage) {
        return (
            <div className="state" role="alert">
                <p>{errorMessage}</p>
                {onRetry && (
                    <button className="button secondary" onClick={onRetry}>
                        다시 시도
                    </button>
                )}
            </div>
        );
    }
    if (isEmpty) {
        return <div className="state">아직 표시할 내용이 없어요.</div>;
    }
    return null;
}

export function Modal({ title, onClose, children }) {
    const modalRef = useRef(null);

    // 열려 있는 동안 배경 스크롤을 막고, Esc로 닫기와 Tab 포커스 순환을 지원합니다.
    useEffect(() => {
        const previousFocusedElement = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        modalRef.current.focus();

        const closeOnEscapeAndTrapFocus = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
            if (event.key !== "Tab") {
                return;
            }
            const focusableElements = modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement?.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement?.focus();
            }
        };

        document.addEventListener("keydown", closeOnEscapeAndTrapFocus);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", closeOnEscapeAndTrapFocus);
            previousFocusedElement?.focus();
        };
    }, [onClose]);

    return (
        <div
            className="overlay"
            onClick={(event) => event.target === event.currentTarget && onClose()}
        >
            <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={modalRef}
            >
                <button className="icon-button modal-close" onClick={onClose} aria-label="닫기">
                    <X size={20} />
                </button>
                {children}
            </section>
        </div>
    );
}
