import { useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api, tokenStore } from "../api";
import { Logo } from "../components/UI";

const PASSWORD_MIN_LENGTH = 8;
const USERNAME_MAX_LENGTH = 50;

export default function Auth({ isSignup = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 상태 반영 전에 들어오는 연속 클릭을 막습니다.
    const isSubmittingRef = useRef(false);

    async function submitAuthForm(event) {
        event.preventDefault();
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setErrorMessage("");
        const formValues = Object.fromEntries(new FormData(event.currentTarget));
        const credentials = { username: formValues.username.trim(), password: formValues.password };
        try {
            if (isSignup) {
                if (formValues.password !== formValues.passwordConfirm) {
                    throw new Error("비밀번호가 일치하지 않습니다.");
                }
                await api.signup(credentials);
                navigate("/login", { state: { signedUp: true } });
            } else {
                const loginResponse = await api.login(credentials);
                tokenStore.set(loginResponse.accessToken);
                navigate("/");
            }
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <div className="auth-layout">
            <aside className="auth-art">
                <Logo />
                <div className="auth-copy">
                    <span className="eyebrow">QUEUE-BASED RESERVATION</span>
                    <h1>
                        대기열 기반
                        <br />
                        팝업 예약 서비스
                    </h1>
                    <ol className="auth-steps">
                        <li>예약하기를 누르면 대기실로 이동해 대기열에 등록됩니다.</li>
                        <li>대기실에서 내 앞 대기 인원을 확인할 수 있어요.</li>
                        <li>차례가 되면 예약 화면으로 자동 이동합니다.</li>
                        <li>제한 시간 안에 날짜와 시간을 선택해 예약을 확정하세요.</li>
                    </ol>
                </div>
                <div />
            </aside>
            <main className="auth-main">
                <div className="mobile-logo">
                    <Logo />
                </div>
                <div className="auth-form">
                    <span className="eyebrow">ACCOUNT</span>
                    <h1>{isSignup ? "회원가입" : "로그인"}</h1>
                    <p className="muted">
                        {isSignup
                            ? "아이디와 비밀번호만으로 가입할 수 있어요."
                            : "로그인하고 예약을 진행하세요."}
                    </p>
                    {!isSignup && location.state?.signedUp && (
                        <p className="success-note" role="status">
                            회원가입이 완료되었어요. 로그인해주세요.
                        </p>
                    )}
                    <form onSubmit={submitAuthForm}>
                        <label>
                            아이디
                            <input
                                name="username"
                                autoComplete="username"
                                placeholder="아이디를 입력해주세요"
                                required
                                maxLength={USERNAME_MAX_LENGTH}
                            />
                        </label>
                        <label>
                            비밀번호
                            <input
                                name="password"
                                type="password"
                                minLength={PASSWORD_MIN_LENGTH}
                                autoComplete={isSignup ? "new-password" : "current-password"}
                                placeholder="8자 이상 입력해주세요"
                                required
                            />
                        </label>
                        {isSignup && (
                            <label>
                                비밀번호 확인
                                <input
                                    name="passwordConfirm"
                                    type="password"
                                    minLength={PASSWORD_MIN_LENGTH}
                                    autoComplete="new-password"
                                    placeholder="비밀번호를 다시 입력해주세요"
                                    required
                                />
                            </label>
                        )}
                        {errorMessage && (
                            <p className="error" role="alert">
                                {errorMessage}
                            </p>
                        )}
                        <button className="button full" disabled={isSubmitting}>
                            {isSubmitting ? "처리 중" : isSignup ? "회원가입" : "로그인"}
                            <ArrowRight size={18} />
                        </button>
                    </form>
                    {!isSignup && import.meta.env.VITE_USE_MOCK === "true" && (
                        <p className="mock-note">
                            아무 아이디와 8자 이상 비밀번호로 로그인해 체험할 수 있어요.
                        </p>
                    )}
                    <p className="auth-switch">
                        {isSignup ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}{" "}
                        <Link to={isSignup ? "/login" : "/signup"}>
                            {isSignup ? "로그인" : "회원가입"}
                        </Link>
                    </p>
                </div>
                <p className="auth-legal">© 2026 popupday</p>
            </main>
        </div>
    );
}
