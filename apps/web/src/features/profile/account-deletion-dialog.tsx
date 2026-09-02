import * as React from "react";
import type { AccountDeletionPreview } from "@bookseasoning/contracts/public";
import { CircleAlert, ShieldAlert, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../app/auth-provider";
import { useAppRuntime } from "../../app/app-runtime";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { HttpClientError } from "../../data/http-client";
import { useAccountDeletionPreviewQuery } from "./account-query";

const blockerCopy: Record<AccountDeletionPreview["blockers"][number], Readonly<{ title: string; description: string }>> = {
  ADMIN_ROLE: {
    title: "관리자 역할 해제 필요",
    description: "관리자 계정은 역할을 수동으로 해제한 뒤 탈퇴할 수 있습니다.",
  },
  ACTIVE_PARTICIPATION: {
    title: "진행 중인 토론 참여",
    description: "참여 중인 토론이 공식 종료된 뒤 다시 시도해 주세요.",
  },
  HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL: {
    title: "예정된 토론의 방장",
    description: "방장 권한을 이전하거나 예정된 방을 취소한 뒤 다시 시도해 주세요.",
  },
};

function errorMessage(error: unknown) {
  if (!(error instanceof HttpClientError)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (error.code === "CURRENT_PASSWORD_INVALID") return "현재 비밀번호가 맞지 않습니다.";
  if (error.code === "ACCOUNT_DELETION_BLOCKED") return "탈퇴 조건이 바뀌었습니다. 현재 상태를 다시 확인해 주세요.";
  if (error.code === "ACCOUNT_DELETION_PENDING") return "계정 삭제를 계속 처리하고 있습니다. 잠시 후 다시 시도해 주세요.";
  if (error.code === "ACCOUNT_NOT_FOUND") return "계정 상태를 확인할 수 없습니다. 다시 로그인한 뒤 확인해 주세요.";
  if (error.code === "NETWORK_UNAVAILABLE") return "네트워크 연결을 확인해 주세요.";
  return error.message;
}

function DeletionImpact({ preview }: Readonly<{ preview: AccountDeletionPreview }>) {
  const sharedCount = preview.affected.messages + preview.affected.publicPrep + preview.affected.closingResponses;
  return (
    <div className="grid gap-3 rounded-lg bg-surface-muted p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <span aria-hidden="true" className="mt-0.5 text-accent-strong">✓</span>
        <strong className="text-[14px]">공동 기록 {sharedCount}개 유지</strong>
        <span />
        <p className="text-caption m-0 text-muted-foreground">내용은 남고 작성자 이름은 ‘탈퇴한 사용자’로 바뀝니다.</p>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <Trash2 aria-hidden="true" className="mt-0.5 size-4 text-destructive" />
        <strong className="text-[14px]">비공개 사전 입력 {preview.affected.privatePrep}개 삭제</strong>
        <span />
        <p className="text-caption m-0 text-muted-foreground">계정 정보와 함께 영구 삭제되며 복구할 수 없습니다.</p>
      </div>
    </div>
  );
}

export function AccountDeletionDialog() {
  const auth = useAuth();
  const { account } = useAppRuntime();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const commandId = React.useRef(crypto.randomUUID());
  const preview = useAccountDeletionPreviewQuery(open);

  function resetSensitiveState() {
    setPassword("");
    setConfirmed(false);
    setError(undefined);
    setSubmitting(false);
    commandId.current = crypto.randomUUID();
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || !password) return;
    setError(undefined);
    setSubmitting(true);
    try {
      await account.deleteAccount({
        commandId: commandId.current,
        currentPassword: password,
        confirmPermanentDeletion: true,
      });
      setPassword("");
      await auth.completeAccountDeletion();
      navigate("/auth/login?deleted=1", { replace: true });
    } catch (caught) {
      setPassword("");
      setConfirmed(false);
      setError(errorMessage(caught));
      if (caught instanceof HttpClientError && caught.code === "ACCOUNT_DELETION_BLOCKED") {
        void preview.refetch();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (submitting && !next) return;
      setOpen(next);
      if (!next) resetSensitiveState();
    }}>
      <DialogTrigger asChild>
        <button type="button" className="flex min-h-16 w-full items-center justify-between gap-4 border-0 border-b border-border bg-transparent px-0.5 text-left text-body text-destructive hover:bg-surface">
          <span>계정 탈퇴</span><Trash2 aria-hidden="true" className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>계정을 탈퇴할까요?</DialogTitle>
          <DialogDescription>탈퇴 가능 여부와 삭제되는 정보를 먼저 확인합니다.</DialogDescription>
        </DialogHeader>

        {preview.isPending && <div role="status" className="grid gap-3 py-3"><div className="h-16 animate-pulse rounded-lg bg-surface-muted" /><div className="h-24 animate-pulse rounded-lg bg-surface-muted" /></div>}
        {preview.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"><p role="alert" className="text-body m-0 text-destructive">{errorMessage(preview.error)}</p><Button className="mt-4" onClick={() => void preview.refetch()}>다시 확인</Button></div>}

        {preview.data && !preview.data.allowed && (
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-topic-border bg-topic-background p-4">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
              <div><strong className="text-[14px]">지금은 탈퇴할 수 없습니다</strong><p className="text-caption mb-0 mt-1 text-muted-foreground">아래 항목을 먼저 정리해 주세요.</p></div>
            </div>
            <ul className="m-0 grid gap-3 p-0">
              {preview.data.blockers.map((blocker) => <li key={blocker} className="list-none rounded-lg border border-border p-4"><strong className="text-[14px]">{blockerCopy[blocker].title}</strong><p className="text-caption mb-0 mt-1 text-muted-foreground">{blockerCopy[blocker].description}</p></li>)}
            </ul>
            {preview.data.blockers.some((blocker) => blocker !== "ADMIN_ROLE") && <Button asChild><Link to="/discussions">내 토론 확인</Link></Button>}
          </div>
        )}

        {preview.data?.allowed && (
          <form className="grid gap-5" onSubmit={deleteAccount}>
            <DeletionImpact preview={preview.data} />
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-caption text-foreground">
              탈퇴하면 로그인할 수 없고 복구할 수 없습니다. 같은 이메일로 다시 가입해도 이전 기록과 연결되지 않습니다.
            </div>
            <label className="grid gap-2 text-label" htmlFor="delete-account-password">현재 비밀번호<Input id="delete-account-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(undefined); }} aria-invalid={Boolean(error)} aria-describedby={error ? "delete-account-error" : undefined} /></label>
            <label className="flex items-start gap-3 text-body"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>삭제되는 정보와 공동 기록의 익명화 방식을 확인했으며, 영구 탈퇴에 동의합니다.</span></label>
            {error && <p id="delete-account-error" role="alert" className="text-caption m-0 flex items-start gap-2 text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}</p>}
            <DialogFooter><Button type="submit" variant="destructive" disabled={!password || !confirmed || submitting}>{submitting ? "처리 중" : "영구 탈퇴"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
