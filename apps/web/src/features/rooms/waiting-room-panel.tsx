import * as React from "react";
import type { RoomDetail } from "@bookseasoning/contracts/public";
import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAppRuntime } from "../../app/app-runtime";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { HttpClientError } from "../../data/http-client";
import { createCommandId } from "../../lib/command-id";
import { getSessionDeviceId } from "../../lib/session-device-id";
import { PrepSection } from "./prep-section";
import { RoomMembersSection } from "./room-members-section";
import {
  useCancelMembershipMutation,
  useCancelRoomMutation,
  useStartSessionMutation,
  useWaitingRoomSessionQuery,
} from "./room-query";

export function WaitingRoomPanel({
  detail,
  onRefresh,
}: Readonly<{ detail: RoomDetail; onRefresh(): Promise<unknown> }>) {
  const navigate = useNavigate();
  const { sessions } = useAppRuntime();
  const snapshot = useWaitingRoomSessionQuery(detail.roomId, true);
  const cancelMembership = useCancelMembershipMutation(detail.roomId);
  const cancelRoom = useCancelRoomMutation(detail.roomId);
  const start = useStartSessionMutation(detail.roomId);
  const [exitAction, setExitAction] = React.useState<"membership" | "room" | null>(null);
  const [commandId, setCommandId] = React.useState<string>();
  const [actionError, setActionError] = React.useState<string>();
  const [startCommandId, setStartCommandId] = React.useState<string>();
  const [startError, setStartError] = React.useState<string>();

  React.useEffect(() => {
    const deviceId = getSessionDeviceId(detail.roomId);
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function beat() {
      let delay: number;
      try {
        const response = await sessions.heartbeat(detail.roomId, deviceId);
        delay = response.heartbeatIntervalSeconds * 1000;
        await Promise.all([snapshot.refetch(), onRefresh()]);
      } catch {
        delay = 15_000;
      }
      if (!stopped) timeout = setTimeout(beat, delay);
    }
    void beat();
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [detail.roomId, onRefresh, sessions, snapshot.refetch]);

  const session = snapshot.data;
  const isHost = detail.actorRole === "HOST";
  const connectedCount = session?.connectedParticipantCount;
  const startsAt = new Date(detail.scheduledStartAt).getTime();
  const startTimeReached = Date.now() >= startsAt;
  const hasEnoughConnected = connectedCount !== undefined && connectedCount >= detail.minParticipants;
  const canStart = isHost && startTimeReached && hasEnoughConnected && session?.state.phase === "SCHEDULED";

  async function runExitAction() {
    if (!exitAction) return;
    const nextCommandId = commandId ?? createCommandId();
    setCommandId(nextCommandId);
    setActionError(undefined);
    const request = { commandId: nextCommandId, expectedVersion: detail.aggregateVersion, payload: {} };
    try {
      if (exitAction === "membership") await cancelMembership.mutateAsync(request);
      else await cancelRoom.mutateAsync(request);
      navigate("/discussions", { replace: true });
    } catch (error) {
      if (error instanceof HttpClientError && error.code === "AGGREGATE_VERSION_CONFLICT") {
        setActionError("방 상태가 변경되었습니다. 최신 정보를 다시 확인해 주세요.");
        setCommandId(undefined);
        await onRefresh();
      } else {
        setActionError(exitAction === "membership" ? "참가를 취소하지 못했습니다." : "토론방을 취소하지 못했습니다.");
      }
    }
  }

  async function startDiscussion() {
    if (!session) return;
    const nextCommandId = startCommandId ?? createCommandId();
    setStartCommandId(nextCommandId);
    setStartError(undefined);
    try {
      await start.mutateAsync({
        commandId: nextCommandId,
        expectedPhaseVersion: session.state.phaseVersion,
        payload: {},
      });
      navigate(`/rooms/${detail.roomId}/session`);
    } catch (error) {
      const code = error instanceof HttpClientError ? error.code : "UNKNOWN";
      if (code === "MINIMUM_CONNECTED_PARTICIPANTS_NOT_MET") {
        setStartError("접속 중인 참가자가 최소 인원보다 적습니다.");
      } else if (code === "SESSION_START_TOO_EARLY") {
        setStartError("시작 예정 시각이 지나면 토론을 시작할 수 있습니다.");
      } else if (code === "PHASE_VERSION_CONFLICT" || code === "SESSION_START_LOCKED") {
        setStartError("토론 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.");
        setStartCommandId(undefined);
      } else {
        setStartError("토론을 시작하지 못했습니다. 현재 상태를 다시 확인해 주세요.");
      }
      await Promise.all([snapshot.refetch(), onRefresh()]);
    }
  }

  const mutationBusy = cancelMembership.isPending || cancelRoom.isPending;

  return (
    <div className="grid gap-12">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
        <RoomMembersSection detail={detail} participants={session?.participants} onRefresh={onRefresh} />

        <aside className="grid content-start gap-4">
          <div className="grid gap-4 rounded-xl bg-surface p-5">
            <div>
              <span className="text-caption text-muted-foreground">현재 접속</span>
              <strong className="mt-1 block text-[24px] leading-8">{connectedCount ?? "–"}<span className="text-body font-normal"> / 최소 {detail.minParticipants}명</span></strong>
            </div>
            {isHost ? (
              <>
                <Button variant="primary" size="lg" disabled={!canStart || start.isPending} onClick={() => void startDiscussion()}><Play aria-hidden="true" />{start.isPending ? "시작 중" : "토론 시작"}</Button>
                {!startTimeReached && <p className="text-caption m-0 text-muted-foreground">시작 예정 시각 이후 활성화됩니다.</p>}
                {startTimeReached && connectedCount === undefined && <p className="text-caption m-0 text-muted-foreground">접속 상태를 확인하고 있습니다.</p>}
                {startTimeReached && connectedCount !== undefined && !hasEnoughConnected && <p className="text-caption m-0 text-muted-foreground">{detail.minParticipants - connectedCount}명이 더 접속하면 시작할 수 있어요.</p>}
              </>
            ) : (
              <p className="text-body m-0">방장이 토론을 시작하면 바로 알려드릴게요.</p>
            )}
            {startError && <p role="alert" className="text-caption m-0 text-destructive">{startError}</p>}
            {snapshot.isError && <Button size="sm" onClick={() => void snapshot.refetch()}>접속 상태 다시 확인</Button>}
          </div>
        </aside>
      </div>

      <PrepSection roomId={detail.roomId} />

      <div className="border-t border-border pt-6">
        {isHost ? (
          <Button variant="link" className="px-0 text-destructive" onClick={() => { setExitAction("room"); setCommandId(undefined); setActionError(undefined); }}>토론방 취소</Button>
        ) : (
          <Button variant="link" className="px-0 text-destructive" onClick={() => { setExitAction("membership"); setCommandId(undefined); setActionError(undefined); }}>참가 취소</Button>
        )}
      </div>

      <Dialog open={exitAction !== null} onOpenChange={(open) => { if (!open && !mutationBusy) setExitAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{exitAction === "room" ? "토론방을 취소할까요?" : "토론 참가를 취소할까요?"}</DialogTitle>
            <DialogDescription>{exitAction === "room" ? "모든 참가자의 등록이 해제되고 이 방의 사전 생각도 더 이상 볼 수 없습니다." : "내 토론에서 사라지고 정원에서 제외됩니다."}</DialogDescription>
          </DialogHeader>
          {actionError && <p role="alert" className="text-caption m-0 text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button disabled={mutationBusy} onClick={() => setExitAction(null)}>돌아가기</Button>
            <Button variant="destructive" disabled={mutationBusy} onClick={() => void runExitAction()}>{mutationBusy ? "처리 중" : "취소하기"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
