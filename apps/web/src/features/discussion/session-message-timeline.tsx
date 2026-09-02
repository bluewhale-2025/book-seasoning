import type { SessionSnapshot } from "@bookseasoning/contracts/public";

import { AIHostIntervention } from "../../components/discussion/ai-host-intervention";
import { ParticipantMessage } from "../../components/discussion/participant-message";
import { PendingMessage } from "../../components/discussion/pending-message";
import { TypingIndicator } from "../../components/discussion/discussion-states";
import { Button } from "../../components/ui/button";
import type { DiscussionSessionController } from "./use-discussion-session";
import { useSessionStore } from "./session-store";
import { useMessageViewport } from "./use-message-viewport";

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

type SessionMessageTimelineProps = Readonly<{
  snapshot: SessionSnapshot;
  controller: DiscussionSessionController;
  typingNames: string[];
  readOnly: boolean;
  showPending?: boolean;
}>;

export function SessionMessageTimeline({
  snapshot,
  controller,
  typingNames,
  readOnly,
  showPending = true,
}: SessionMessageTimelineProps) {
  const pendingMessages = useSessionStore((state) => state.pendingMessages);
  const viewport = useMessageViewport(
    snapshot.sessionId,
    snapshot.cursors.latestMessageSeq,
  );

  return (
    <>
      <section className="min-h-[55dvh] px-4 py-6 sm:px-6" aria-label="토론 메시지">
        {snapshot.cursors.hasMoreMessagesBefore && (
          <div className="mb-6 text-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={controller.loadingOlder}
              onClick={() => void controller.loadOlder()}
            >
              {controller.loadingOlder ? "불러오는 중" : "이전 메시지 50개 보기"}
            </Button>
          </div>
        )}

        <div aria-live="polite" aria-relevant="additions">
          {snapshot.messages.map((message) =>
            message.kind === "AI_HOST" ? (
              <AIHostIntervention key={message.messageId}>{message.body}</AIHostIntervention>
            ) : (
              <ParticipantMessage
                key={message.messageId}
                author={message.author.profileName}
                initials={message.author.profileName.slice(0, 1)}
                timestamp={formatTimestamp(message.confirmedAt)}
                reply={
                  message.reply === null
                    ? undefined
                    : {
                        author: message.reply.authorProfileName,
                        quote: message.reply.quote,
                      }
                }
                onReply={readOnly ? undefined : () => controller.replyTo(message)}
              >
                <span className="whitespace-pre-wrap">{message.body}</span>
              </ParticipantMessage>
            ),
          )}
        </div>

        {showPending && pendingMessages.map((message) => (
          <PendingMessage
            key={message.clientMessageId}
            body={message.body}
            status={message.status}
            onRetry={() => void controller.retryMessage(message.clientMessageId)}
          />
        ))}

        {typingNames.length > 0 && <TypingIndicator names={typingNames} className="mt-5" />}
        <div ref={viewport.bottomRef} className="h-px" aria-hidden="true" />
      </section>

      {viewport.newMessageCount > 0 && (
        <div className="sticky bottom-24 z-20 flex justify-center px-4">
          <Button variant="primary" size="sm" onClick={viewport.scrollToLatest}>
            새 메시지 {viewport.newMessageCount}개
          </Button>
        </div>
      )}
    </>
  );
}
