import { LoaderCircle, RefreshCw, Users } from "lucide-react";

import { BookContextHeader } from "../../components/book/book-context-header";
import { CurrentTopic } from "../../components/discussion/current-topic";
import { ParticipantPresence } from "../../components/discussion/discussion-states";
import { MessageComposer } from "../../components/discussion/message-composer";
import { SessionControls } from "../../components/discussion/session-controls";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ClosingResponsePanel } from "./closing-response-panel";
import type { DiscussionSessionDependencies } from "./discussion-session-dependencies";
import { EndedDiscussionView } from "./ended-discussion-view";
import {
  canHostEndSession,
  hasExtensionDecisionWindow,
  isSessionReadOnly,
  sessionCountdownDeadline,
} from "./session-capabilities";
import { SessionMessageTimeline } from "./session-message-timeline";
import { useSessionStore, useSessionStoreApi } from "./session-store";
import { useDiscussionSession } from "./use-discussion-session";
import { useSessionCountdown } from "./use-session-countdown";

const phaseLabels = {
  SCHEDULED: "시작 예정",
  OPENING: "토론 중",
  CORE: "토론 중",
  EXTENDED: "연장 중",
  SYNTHESIS: "마무리 중",
  CLOSING: "마무리 중",
  ENDED: "종료",
  CANCELED: "취소됨",
} as const;

const connectionLabels = {
  connecting: "연결 중",
  connected: "연결됨",
  reconnecting: "재연결 중",
  failed: "동기화 실패",
} as const;

type DiscussionSessionScreenProps = Readonly<{
  roomId: string;
  dependencies: DiscussionSessionDependencies;
}>;

export function DiscussionSessionScreen({
  roomId,
  dependencies,
}: DiscussionSessionScreenProps) {
  const controller = useDiscussionSession(roomId, dependencies.api, dependencies.realtime);
  const store = useSessionStoreApi();
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const presenceUserIds = useSessionStore((state) => state.presenceUserIds);
  const typingUserIds = useSessionStore((state) => state.typingUserIds);
  const replyTarget = useSessionStore((state) => state.replyTarget);
  const snapshot = controller.snapshot;
  const remainingSeconds = useSessionCountdown(
    snapshot?.serverTime,
    snapshot ? sessionCountdownDeadline(snapshot) : null,
  );
  const decisionRemainingSeconds = useSessionCountdown(
    snapshot?.serverTime,
    snapshot?.state.deadlines.extensionDecisionDeadlineAt,
  );

  if (controller.loading) {
    return (
      <main className="grid min-h-dvh place-items-center px-4" aria-busy="true">
        <p className="text-body inline-flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          토론 내용을 동기화하고 있습니다
        </p>
      </main>
    );
  }

  if (controller.error || !snapshot) {
    return (
      <main
        className="grid min-h-dvh place-items-center px-4"
        data-error-code={
          controller.error && "code" in controller.error
            ? String(controller.error.code)
            : "SESSION_LOAD_FAILED"
        }
      >
        <section className="max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <h1 className="text-section-title m-0">토론방을 불러오지 못했습니다</h1>
          <p className="text-body mt-2 text-muted-foreground">
            접근 권한과 연결 상태를 확인한 뒤 다시 시도해 주세요.
          </p>
          <Button variant="primary" onClick={() => void controller.recover()}>
            <RefreshCw aria-hidden="true" />
            다시 동기화
          </Button>
        </section>
      </main>
    );
  }

  const typingNames = snapshot.participants
    .filter(
      (participant) =>
        participant.userId !== snapshot.actor.userId && typingUserIds.has(participant.userId),
    )
    .map((participant) => participant.profileName);
  const readOnly = isSessionReadOnly(snapshot);

  if (snapshot.state.phase === "ENDED") {
    return (
      <TooltipProvider>
        <EndedDiscussionView
          roomId={roomId}
          snapshot={snapshot}
          controller={controller}
          api={dependencies.api}
          rooms={dependencies.rooms}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
        <header className="z-30 shrink-0 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-[var(--layout-conversation-max)] items-center justify-between gap-3 px-4 sm:px-5">
            <span className="text-label text-accent-strong">책은양념</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{phaseLabels[snapshot.state.phase]}</Badge>
              <span
                className="text-caption text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {connectionLabels[connectionStatus]}
              </span>
            </div>
          </div>
        </header>

        {connectionStatus !== "connected" && (
          <div
            className="shrink-0 border-b border-warning/25 bg-warning-background px-4 py-2 text-center text-sm text-warning"
            role="status"
          >
            {connectionStatus === "failed"
              ? "동기화하지 못했습니다. 입력을 잠그고 다시 연결을 기다리고 있습니다."
              : "놓친 대화를 확인하는 동안 메시지 입력을 잠시 멈춥니다."}
          </div>
        )}

        <main className="mx-auto flex min-h-0 w-full max-w-[var(--layout-conversation-max)] flex-1 flex-col overflow-hidden border-x border-border/70 bg-surface max-sm:border-x-0">
          <BookContextHeader
            title={snapshot.room.bookTitle}
            author={snapshot.room.bookAuthor}
            {...(snapshot.room.bookCoverUrl === null
              ? {}
              : { coverSrc: snapshot.room.bookCoverUrl })}
            remainingSeconds={remainingSeconds}
            phase={snapshot.state.phase}
            participantCount={snapshot.connectedParticipantCount}
            compact
            className="shrink-0"
          />

          <SessionControls
            phase={snapshot.state.phase}
            isHost={snapshot.actor.role === "HOST"}
            extensionDecisionOpen={hasExtensionDecisionWindow(snapshot)}
            decisionRemainingSeconds={decisionRemainingSeconds}
            canEnd={canHostEndSession(snapshot)}
            busyAction={controller.controlBusy}
            errorMessage={controller.controlError}
            onExtend={controller.extendSession}
            onStartSynthesis={controller.startSynthesis}
            onEnd={controller.endSession}
          />

          {snapshot.publicDiscussion.currentTopic && (
            <CurrentTopic topic={snapshot.publicDiscussion.currentTopic} compact className="shrink-0" />
          )}

          <details className="shrink-0 border-b border-border bg-surface-muted px-4 py-2.5 sm:px-5">
            <summary className="text-metadata flex min-h-8 cursor-pointer list-none items-center gap-2 font-semibold">
              <Users aria-hidden="true" className="size-4 text-accent-strong" />
              참가자 {snapshot.participants.length}명
            </summary>
            <ul className="mt-2 grid list-none gap-2 p-0 sm:grid-cols-2">
              {snapshot.participants.map((participant) => (
                <li key={participant.userId} className="flex items-center justify-between gap-2">
                  <ParticipantPresence
                    name={participant.profileName}
                    online={
                      presenceUserIds.has(participant.userId) ||
                      participant.connectionStatus === "ONLINE"
                    }
                  />
                  {participant.role === "HOST" && <Badge variant="outline">방장</Badge>}
                </li>
              ))}
            </ul>
          </details>

          <SessionMessageTimeline
            snapshot={snapshot}
            controller={controller}
            typingNames={typingNames}
            readOnly={readOnly}
          />

          {snapshot.state.phase === "CLOSING" ? (
            <ClosingResponsePanel
              roomId={roomId}
              snapshot={snapshot}
              api={dependencies.api}
              onRecover={controller.recover}
            />
          ) : readOnly ? (
            <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-4 text-center">
              <p className="text-body m-0 text-muted-foreground">
                이 토론의 메시지는 읽기만 할 수 있습니다.
              </p>
            </div>
          ) : (
            <MessageComposer
              disabled={!controller.composerEnabled}
              replyingTo={replyTarget?.author.profileName}
              replyingQuote={replyTarget?.body}
              sticky={false}
              onCancelReply={() => store.getState().setReplyTarget(null)}
              onTypingChange={controller.setLocalTyping}
              onSubmit={(body) => void controller.sendMessage(body)}
              aria-label="토론 메시지 작성"
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
