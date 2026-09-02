import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../app/auth-provider";
import { BrandLogo } from "../../components/ui/brand-logo";

export function AuthLoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center px-5" aria-busy="true">
      <div className="grid justify-items-center gap-4 text-muted-foreground">
        <BrandLogo />
        <p className="text-body m-0" role="status">로그인 상태를 확인하고 있습니다.</p>
      </div>
    </main>
  );
}

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "anonymous") {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const auth = useAuth();
  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "authenticated") return <Navigate to="/discussions" replace />;
  return <Outlet />;
}

export function AuthenticatedIndexRoute() {
  const auth = useAuth();
  if (auth.status === "loading") return <AuthLoadingScreen />;
  return <Navigate to={auth.status === "authenticated" ? "/discussions" : "/auth/login"} replace />;
}
