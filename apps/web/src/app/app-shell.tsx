import { BookOpenCheck, LogOut, Menu, Plus, Search, UserRound } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { BrandLogo } from "../components/ui/brand-logo";
import { IconButton } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { useProfileQuery } from "../features/profile/profile-query";
import { cn } from "../lib/utils";
import { useAuth } from "./auth-provider";

function DesktopNavigation() {
  return (
    <nav aria-label="서비스 탐색" className="absolute left-1/2 hidden h-full -translate-x-1/2 items-center gap-8 md:flex">
      {[
        ["/discussions", "내 토론"],
        ["/discussions/find", "토론 찾기"],
      ].map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/discussions"}
          className={({ isActive }) => cn(
            "relative flex h-full items-center px-0.5 text-[14px] font-medium text-muted-foreground no-underline hover:text-foreground",
            isActive && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground",
          )}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function CreateDiscussionAction() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton asChild label="토론 만들기" variant="ghost">
          <Link to="/rooms/new"><Plus aria-hidden="true" /></Link>
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>토론 만들기</TooltipContent>
    </Tooltip>
  );
}

export function AppShell() {
  const auth = useAuth();
  const profile = useProfileQuery();
  const profileName = profile.data?.profileName.trim() || "나";
  const initial = profileName.charAt(0);

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-40 h-[var(--layout-header-height)] border-b border-border bg-surface-elevated/95 backdrop-blur">
          <div className="relative mx-auto flex h-full max-w-[var(--layout-shell-max)] items-center justify-between px-3 sm:px-6">
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="메뉴" variant="ghost"><Menu aria-hidden="true" /></IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link to="/discussions" className="no-underline">내 토론</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/discussions/find" className="no-underline"><Search aria-hidden="true" />토론 찾기</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/rooms/new" className="no-underline"><Plus aria-hidden="true" />토론 만들기</Link>
                  </DropdownMenuItem>
                  {profile.data?.role === "ADMIN" && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/admin/book-context" className="no-underline"><BookOpenCheck aria-hidden="true" />Book Context 관리</Link></DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link to="/discussions" className="absolute left-1/2 -translate-x-1/2 no-underline md:static md:translate-x-0" aria-label="책은양념 홈">
              <BrandLogo showWordmark={false} className="md:hidden" />
              <BrandLogo className="hidden md:inline-flex" />
            </Link>

            <DesktopNavigation />

            <div className="ml-auto flex items-center gap-1">
              <CreateDiscussionAction />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-full border-0 bg-transparent p-0" aria-label="프로필 메뉴">
                    <Avatar>
                      <AvatarFallback className="bg-accent-subtle text-accent-strong">{initial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem disabled className="font-semibold text-foreground">{profileName}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="no-underline"><UserRound aria-hidden="true" />프로필 설정</Link>
                  </DropdownMenuItem>
                  {profile.data?.role === "ADMIN" && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/admin/book-context" className="no-underline"><BookOpenCheck aria-hidden="true" />Book Context 관리</Link></DropdownMenuItem></>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      if (auth.status === "authenticated") {
                        void auth.signOut().catch(() => undefined);
                      }
                    }}
                  >
                    <LogOut aria-hidden="true" />로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <Outlet />
      </div>
    </TooltipProvider>
  );
}
