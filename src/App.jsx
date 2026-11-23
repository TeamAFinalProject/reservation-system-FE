import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    Outlet,
    Link,
    useNavigate,
} from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { tokenStore } from "./api";
import { Logo } from "./components/UI";
import Auth from "./pages/Auth";
import Event from "./pages/Event";
import Waiting from "./pages/Waiting";
import Reservation, { ReservationComplete } from "./pages/Reservation";
import My from "./pages/My";

// 로그인만 확인하고 헤더, 푸터 없이 보여주는 레이아웃 (대기실)
function FullscreenLayout() {
    if (!tokenStore.get()) {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
}

// 로그인 확인 후 헤더, 푸터와 함께 보여주는 기본 레이아웃
function MainLayout() {
    const navigate = useNavigate();
    if (!tokenStore.get()) {
        return <Navigate to="/login" replace />;
    }

    const logout = () => {
        tokenStore.clear();
        navigate("/login");
    };

    return (
        <div className="page-layout">
            <header className="header">
                <div className="header-inner">
                    <Logo />
                    <nav>
                        <Link to="/my">
                            <UserRound size={16} />
                            <span>마이페이지</span>
                        </Link>
                        <span className="nav-divider" />
                        <button onClick={logout}>
                            <LogOut size={15} />
                            <span>로그아웃</span>
                        </button>
                    </nav>
                </div>
            </header>
            <div className="page-content">
                <Outlet />
            </div>
            <footer className="footer">
                <div className="container footer-inner">
                    <span>© 2026 popupday</span>
                </div>
            </footer>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Auth key="login" />} />
                <Route path="/signup" element={<Auth key="signup" isSignup />} />
                <Route element={<FullscreenLayout />}>
                    <Route path="/queue" element={<Waiting />} />
                </Route>
                <Route element={<MainLayout />}>
                    <Route path="/" element={<Event />} />
                    <Route path="/reservation" element={<Reservation />} />
                    <Route path="/reservation/complete" element={<ReservationComplete />} />
                    <Route path="/my" element={<My />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
