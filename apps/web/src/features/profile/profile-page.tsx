import * as React from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { ProfileNameSchema } from "@bookseasoning/contracts/public";

import { useAuth } from "../../app/auth-provider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useProfileQuery, useUpdateProfileMutation } from "./profile-query";
import { AccountDeletionDialog } from "./account-deletion-dialog";

function ProfileLoading() {
  return (
    <div className="mx-auto grid max-w-[540px] gap-5 pt-10" aria-busy="true" aria-label="프로필 불러오는 중">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
      <div className="h-11 animate-pulse rounded-md bg-surface-muted" />
      <div className="mt-6 h-px bg-border" />
      <div className="h-16 animate-pulse rounded bg-surface-muted" />
      <div className="h-16 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  const profile = useProfileQuery();
  const updateProfile = useUpdateProfileMutation();
  const [profileName, setProfileName] = React.useState("");
  const [nameError, setNameError] = React.useState<string>();
  const [logoutError, setLogoutError] = React.useState<string>();

  React.useEffect(() => {
    if (profile.data) setProfileName(profile.data.profileName);
  }, [profile.data]);

  if (profile.isPending) {
    return (
      <main className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-[var(--layout-shell-max)]">
          <header className="flex min-h-20 items-center border-b border-border">
            <h1 className="text-page-title m-0">프로필 설정</h1>
          </header>
          <ProfileLoading />
        </div>
      </main>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <main className="grid min-h-[calc(100dvh-var(--layout-header-height))] place-items-center px-5">
        <section className="grid max-w-md justify-items-start gap-4">
          <h1 className="text-section-title m-0">프로필을 불러오지 못했습니다</h1>
          <p className="text-body m-0 text-muted-foreground">네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
          <Button onClick={() => void profile.refetch()}>다시 시도</Button>
        </section>
      </main>
    );
  }

  const normalized = ProfileNameSchema.safeParse(profileName);
  const changed = normalized.success && normalized.data !== profile.data.profileName;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(undefined);
    const parsed = ProfileNameSchema.safeParse(profileName);
    if (!parsed.success) {
      setNameError("프로필 이름을 입력해 주세요.");
      return;
    }
    try {
      const updated = await updateProfile.mutateAsync({ profileName: parsed.data });
      setProfileName(updated.profileName);
    } catch {
      setNameError("이름을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="px-5 pb-16 sm:px-8">
      <div className="mx-auto max-w-[var(--layout-shell-max)]">
        <header className="flex min-h-20 items-center border-b border-border">
          <h1 className="text-page-title m-0">프로필 설정</h1>
        </header>

        <div className="mx-auto max-w-[540px] pt-10 sm:pt-12">
          <form className="grid gap-3 pb-9" onSubmit={save} noValidate>
            <label htmlFor="profile-name" className="text-label">프로필 이름</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                id="profile-name"
                name="profileName"
                autoComplete="name"
                value={profileName}
                aria-invalid={Boolean(nameError)}
                aria-describedby="profile-name-note profile-name-error"
                onChange={(event) => {
                  setProfileName(event.target.value);
                  setNameError(undefined);
                  updateProfile.reset();
                }}
                onBlur={() => {
                  if (!ProfileNameSchema.safeParse(profileName).success) {
                    setNameError("프로필 이름을 입력해 주세요.");
                  }
                }}
              />
              <Button variant="primary" type="submit" disabled={!changed || updateProfile.isPending}>
                {updateProfile.isPending ? "저장 중" : "저장"}
              </Button>
            </div>
            {nameError && <p id="profile-name-error" role="alert" className="text-caption m-0 text-destructive">{nameError}</p>}
            <p id="profile-name-note" className="text-caption m-0 text-muted-foreground">
              새 메시지·새 토론부터 적용 · 과거 기록의 이름은 유지
            </p>
            <p className="sr-only" aria-live="polite">
              {updateProfile.isSuccess ? "프로필 이름을 저장했습니다." : ""}
            </p>
          </form>

          <section aria-label="계정" className="border-t border-border">
            <div className="flex min-h-16 items-center justify-between gap-5 border-b border-border px-0.5">
              <span className="text-body text-muted-foreground">이메일</span>
              <strong className="min-w-0 break-all text-right text-[14px] font-medium">
                {auth.status === "authenticated" ? auth.user.email : ""}
              </strong>
            </div>
            <Link
              to="/auth/forgot-password"
              className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-0.5 text-body text-foreground no-underline hover:bg-surface"
            >
              <span>비밀번호 재설정</span><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </Link>
            <button
              type="button"
              className="flex min-h-16 w-full items-center justify-between gap-4 border-0 border-b border-border bg-transparent px-0.5 text-left text-body text-foreground hover:bg-surface"
              onClick={() => {
                setLogoutError(undefined);
                void auth.signOut().catch(() => {
                  setLogoutError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                });
              }}
            >
              <span>로그아웃</span><LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
            </button>
            {logoutError && <p role="alert" className="text-caption mt-3 text-destructive">{logoutError}</p>}
            <AccountDeletionDialog />
          </section>
        </div>
      </div>
    </main>
  );
}
