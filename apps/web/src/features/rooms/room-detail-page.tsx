import * as React from "react";
import { ArrowLeft, CalendarDays, Eye, EyeOff, UsersRound } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import { BookCover } from "../../components/book/book-cover";
import { Badge } from "../../components/ui/badge";
import { Button, IconButton } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { HttpClientError } from "../../data/http-client";
import { createCommandId } from "../../lib/command-id";
import { formatRoomDate, roomStatusLabel } from "./room-presenters";
import { useJoinRoomMutation, useRoomDetailQuery } from "./room-query";
import { RoomMembersSection } from "./room-members-section";
import { WaitingRoomPanel } from "./waiting-room-panel";

const activeStatuses = ["DISCUSSING", "EXTENDED", "CLOSING"] as const;

function JoinForm({ roomId, onJoined }: Readonly<{ roomId: string; onJoined(): void }>) {
  const join = useJoinRoomMutation(roomId);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (password.length < 4 || password.length > 20) {
      setError("참가 패스워드는 4~20자로 입력해 주세요.");
      return;
    }
    try {
      await join.mutateAsync({
        commandId: createCommandId(),
        payload: { password },
      });
      setPassword("");
      onJoined();
    } catch (caught) {
      const code = caught instanceof HttpClientError ? caught.code : "UNKNOWN";
      if (code === "ROOM_PASSWORD_INVALID" || code === "ROOM_PASSWORD_CHANGED") {
        setPassword("");
        setError(code === "ROOM_PASSWORD_CHANGED" ? "참가 패스워드가 변경되었습니다. 다시 입력해 주세요." : "패스워드가 올바르지 않습니다");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (code === "ROOM_CAPACITY_REACHED") {
        setError("방금 정원이 마감되었습니다");
      } else if (code === "ROOM_PASSWORD_RATE_LIMITED") {
        setError("잠시 후 다시 시도해주세요.");
      } else if (code === "ROOM_MEMBER_REMOVED") {
        setError("이 토론방에 다시 참여할 수 없습니다.");
      } else {
        setError("참가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  return (
    <form className="grid gap-3 rounded-xl bg-surface p-5" onSubmit={submit} noValidate>
      <label htmlFor="join-password" className="text-label">참가 패스워드</label>
      <div className="grid grid-cols-[minmax(0,1fr)_44px] rounded-md border border-border-strong bg-surface-elevated focus-within:ring-2 focus-within:ring-focus-ring">
        <Input
          ref={inputRef}
          id="join-password"
          type={showPassword ? "text" : "password"}
          value={password}
          minLength={4}
          maxLength={20}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "join-password-error" : undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(undefined);
          }}
          className="border-0 focus-visible:ring-0"
          autoFocus
        />
        <IconButton label={showPassword ? "참가 패스워드 숨기기" : "참가 패스워드 보기"} variant="ghost" onClick={() => setShowPassword((current) => !current)}>
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </IconButton>
      </div>
      {error && <p id="join-password-error" role="alert" className="text-caption m-0 text-destructive">{error}</p>}
      <p className="text-caption m-0 text-muted-foreground">계정 비밀번호가 아니라 방장에게 전달받은 참가 패스워드입니다.</p>
      <Button variant="primary" size="lg" type="submit" disabled={join.isPending} className="mt-2 w-full">
        {join.isPending ? "참가 중" : "참가하기"}
      </Button>
    </form>
  );
}

export function RoomDetailPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const room = useRoomDetailQuery(roomId ?? "");
  const [showJoin, setShowJoin] = React.useState(false);
  const [joined, setJoined] = React.useState(false);
  const created = Boolean((location.state as { created?: unknown } | null)?.created);

  if (!roomId) return null;
  if (room.isPending) {
    return (
      <main className="mx-auto grid max-w-3xl gap-5 px-5 py-12" aria-busy="true" aria-label="토론 정보 불러오는 중">
        <div className="h-36 animate-pulse rounded-xl bg-surface-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-muted" />
      </main>
    );
  }
  if (room.isError || !room.data) {
    return (
      <main className="mx-auto grid max-w-md justify-items-start gap-4 px-5 py-20">
        <h1 className="text-page-title m-0">토론 정보를 불러오지 못했습니다</h1>
        <p className="text-body m-0 text-muted-foreground">토론이 삭제되었거나 접근할 수 없는 상태일 수 있습니다.</p>
        <Button asChild><Link to="/discussions/find">토론 찾기로 돌아가기</Link></Button>
      </main>
    );
  }

  const detail = room.data;
  const isActive = activeStatuses.includes(detail.displayStatus as typeof activeStatuses[number]);
  const isMember = detail.actorRole !== "NONE";
  const isWaitingRoom = isMember && (detail.displayStatus === "SCHEDULED" || detail.displayStatus === "WAITING");
  const canJoin = detail.actorRole === "NONE" && detail.availability === "OPEN" && !["ENDED", "CANCELED"].includes(detail.displayStatus);

  return (
    <main className="px-5 pb-20 sm:px-8">
      <section className="mx-auto max-w-3xl pt-8 sm:pt-12">
        <Button asChild variant="ghost" className="-ml-3 mb-5"><Link to="/discussions/find"><ArrowLeft aria-hidden="true" />토론 찾기</Link></Button>

        {created && (
          <div role="status" className="mb-6 rounded-lg border border-topic-border bg-topic-background p-4 text-body">
            토론을 만들었습니다. 참가 패스워드는 참여할 사람에게 서비스 밖에서 직접 전달해 주세요.
          </div>
        )}
        {joined && (
          <div role="status" className="mb-6 rounded-lg border border-topic-border bg-topic-background p-4 text-body">
            참가 등록을 완료했습니다.
          </div>
        )}

        <header className="grid grid-cols-[68px_minmax(0,1fr)] gap-5 border-b border-border pb-8">
          <BookCover title={detail.bookTitle} src={detail.bookCoverUrl ?? undefined} size="lg" />
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant={detail.displayStatus === "DISCUSSING" ? "accent" : "neutral"}>{roomStatusLabel[detail.displayStatus]}</Badge>
              <Badge variant={detail.availability === "OPEN" ? "outline" : "neutral"}>{detail.availability === "OPEN" ? "참여 가능" : "정원 마감"}</Badge>
              {detail.actorRole !== "NONE" && <Badge variant="outline">{detail.actorRole === "HOST" ? "방장" : "참가자"}</Badge>}
            </div>
            <h1 className="text-page-title m-0">{detail.title}</h1>
            <p className="text-body mt-2 mb-0 text-muted-foreground">{detail.bookTitle} · {detail.bookAuthor}</p>
          </div>
        </header>

        {isWaitingRoom ? (
          <div className="grid gap-10 pt-8">
            <section aria-label="토론 일정과 인원" className="grid gap-4 rounded-xl bg-surface p-5 sm:grid-cols-2">
              <div className="flex items-center gap-3"><CalendarDays aria-hidden="true" className="size-5 text-muted-foreground" /><span className="text-body">{formatRoomDate(detail.scheduledStartAt)}</span></div>
              <div className="flex items-center gap-3"><UsersRound aria-hidden="true" className="size-5 text-muted-foreground" /><span className="text-body">현재 {detail.participantCount}명 · 최대 {detail.maxParticipants}명</span></div>
            </section>
            <WaitingRoomPanel detail={detail} onRefresh={room.refetch} />
          </div>
        ) : (
        <div className="grid gap-8 pt-8 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid content-start gap-8">
            <section aria-label="토론 일정과 인원" className="grid gap-4 rounded-xl bg-surface p-5">
              <div className="flex items-center gap-3"><CalendarDays aria-hidden="true" className="size-5 text-muted-foreground" /><span className="text-body">{formatRoomDate(detail.scheduledStartAt)}</span></div>
              <div className="flex items-center gap-3"><UsersRound aria-hidden="true" className="size-5 text-muted-foreground" /><span className="text-body">현재 {detail.participantCount}명 · 최대 {detail.maxParticipants}명</span></div>
              {isMember && !isActive && <p className="text-caption m-0 text-muted-foreground">토론 시작 최소 인원 {detail.minParticipants}명</p>}
            </section>

            {isMember && (
              <RoomMembersSection detail={detail} onRefresh={room.refetch} />
            )}
          </div>

          <aside className="grid content-start gap-3">
            {isMember && isActive && (
              <div className="grid gap-3 rounded-xl bg-surface p-5">
                <p className="text-body m-0">지금 토론이 진행 중입니다.</p>
                <Button asChild variant="primary" size="lg"><Link to={`/rooms/${detail.roomId}/session`}>토론에 참여하기</Link></Button>
              </div>
            )}
            {isMember && detail.displayStatus === "ENDED" && (
              <Button asChild size="lg"><Link to={`/rooms/${detail.roomId}/session`}>토론 기록 보기</Link></Button>
            )}
            {canJoin && !showJoin && <Button variant="primary" size="lg" onClick={() => setShowJoin(true)}>참가하기</Button>}
            {canJoin && showJoin && <JoinForm roomId={detail.roomId} onJoined={() => { setJoined(true); setShowJoin(false); }} />}
            {detail.actorRole === "NONE" && detail.availability === "FULL" && (
              <div className="rounded-xl bg-surface p-5 text-body text-muted-foreground">정원이 마감되어 지금은 참가할 수 없습니다.</div>
            )}
          </aside>
        </div>
        )}
      </section>
    </main>
  );
}
