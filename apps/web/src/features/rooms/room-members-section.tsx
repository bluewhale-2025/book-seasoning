import * as React from "react";
import type { RoomDetail, SessionParticipant } from "@bookseasoning/contracts/public";
import { MoreHorizontal, UserRoundCheck, UserRoundX } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button, IconButton } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { HttpClientError } from "../../data/http-client";
import { createCommandId } from "../../lib/command-id";
import { RoomSettingsDialog } from "./room-settings-dialog";
import { useRemoveMemberMutation, useTransferHostMutation } from "./room-query";

type MemberAction = Readonly<{
  kind: "transfer" | "remove";
  userId: string;
  profileName: string;
}>;

export function RoomMembersSection({
  detail,
  participants,
  onRefresh,
}: Readonly<{
  detail: RoomDetail;
  participants?: readonly SessionParticipant[];
  onRefresh(): Promise<unknown>;
}>) {
  const transfer = useTransferHostMutation(detail.roomId);
  const remove = useRemoveMemberMutation(detail.roomId);
  const [action, setAction] = React.useState<MemberAction | null>(null);
  const [commandId, setCommandId] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const active = ["DISCUSSING", "EXTENDED", "CLOSING"].includes(detail.displayStatus);
  const editable = !["ENDED", "CANCELED"].includes(detail.displayStatus);
  const isHost = detail.actorRole === "HOST";
  const busy = transfer.isPending || remove.isPending;

  async function confirm() {
    if (!action) return;
    const nextCommandId = commandId ?? createCommandId();
    setCommandId(nextCommandId);
    setError(undefined);
    const request = {
      commandId: nextCommandId,
      expectedVersion: detail.aggregateVersion,
      payload: { targetUserId: action.userId },
    };
    try {
      if (action.kind === "transfer") await transfer.mutateAsync(request);
      else await remove.mutateAsync(request);
      setAction(null);
      setCommandId(undefined);
    } catch (caught) {
      if (caught instanceof HttpClientError && caught.code === "AGGREGATE_VERSION_CONFLICT") {
        setError("참가자 상태가 변경되었습니다. 최신 목록을 다시 확인해 주세요.");
        setCommandId(undefined);
        await onRefresh();
      } else {
        setError(action.kind === "transfer" ? "방장 권한을 이전하지 못했습니다." : "참가자를 내보내지 못했습니다.");
      }
    }
  }

  return (
    <section aria-labelledby="room-members-title">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 id="room-members-title" className="text-section-title m-0">참가자</h2>
          <span className="text-metadata text-muted-foreground">{detail.members.length}명</span>
        </div>
        {isHost && editable && <RoomSettingsDialog detail={detail} onRefresh={onRefresh} />}
      </div>
      <ul className="m-0 grid list-none border-t border-border p-0">
        {detail.members.map((member) => {
          const live = participants?.find((participant) => participant.userId === member.userId);
          const canManage = isHost && editable && !member.isHost && (!active || member.membershipStatus === "PARTICIPATED");
          return (
            <li key={member.userId} className="flex min-h-16 items-center justify-between gap-4 border-b border-border">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium">{member.profileName}</span>
                  {member.isHost && <Badge variant="outline">방장</Badge>}
                </div>
                {participants && (
                  <span className="text-caption mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${live?.connectionStatus === "ONLINE" ? "bg-presence-online" : "bg-border-strong"}`} />
                    {live ? (live.connectionStatus === "ONLINE" ? "접속 중" : "오프라인") : "상태 확인 중"}
                  </span>
                )}
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><IconButton label={`${member.profileName} 관리`} variant="ghost"><MoreHorizontal aria-hidden="true" /></IconButton></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { setAction({ kind: "transfer", userId: member.userId, profileName: member.profileName }); setCommandId(undefined); setError(undefined); }}><UserRoundCheck aria-hidden="true" />방장 권한 이전</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => { setAction({ kind: "remove", userId: member.userId, profileName: member.profileName }); setCommandId(undefined); setError(undefined); }}><UserRoundX aria-hidden="true" />내보내기</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.kind === "transfer" ? `${action.profileName}님에게 방장을 넘길까요?` : `${action?.profileName ?? "참가자"}님을 내보낼까요?`}</DialogTitle>
            <DialogDescription>{action?.kind === "transfer" ? "완료되면 나는 일반 참가자가 되고, 새 방장이 방을 운영합니다." : "내보낸 참가자는 이 방에 다시 참여하거나 기록을 열람할 수 없습니다."}</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
          <DialogFooter>
            <Button disabled={busy} onClick={() => setAction(null)}>취소</Button>
            <Button variant={action?.kind === "remove" ? "destructive" : "primary"} disabled={busy} onClick={() => void confirm()}>{busy ? "처리 중" : action?.kind === "transfer" ? "권한 이전" : "내보내기"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
