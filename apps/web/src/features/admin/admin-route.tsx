import { Navigate, Outlet } from "react-router-dom";

import { useProfileQuery } from "../profile/profile-query";

export function AdminRoute() {
  const profile = useProfileQuery();

  if (profile.isPending) {
    return <main className="grid min-h-[60dvh] place-items-center px-5"><p role="status" className="text-body text-muted-foreground">관리자 권한을 확인하고 있습니다.</p></main>;
  }
  if (profile.isError || profile.data?.role !== "ADMIN") return <Navigate to="/discussions" replace />;
  return <Outlet />;
}
