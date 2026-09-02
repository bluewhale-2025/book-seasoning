import * as React from "react";
import type {
  DiscussionRecord,
  GetDiscussionResultResponse,
  PrepEntry,
  SessionSnapshot,
} from "@bookseasoning/contracts/public";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  LockKeyhole,
  MessagesSquare,
  RefreshCw,
  Users,
} from "lucide-react";

import { BookCover } from "../../components/book/book-cover";
import { Badge } from "../../components/ui/badge";
import { Button, IconButton } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { HttpClientError } from "../../data/http-client";
import type { RoomApi } from "../../data/room-api";
import type { SessionApi } from "../../data/session-api";
import { createCommandId } from "../../lib/command-id";
import type { DiscussionSessionController } from "./use-discussion-session";
import { SessionMessageTimeline } from "./session-message-timeline";

type ResultTab = "record" | "conversation" | "prep";

const resultQueryKey = (roomId: string) => ["session", roomId, "result"] as const;
const prepResultQueryKey = (roomId: string) => ["rooms", roomId, "prep"] as const;

const prepPromptLabels = {
  QUOTE_THOUGHT: "좋아했던 문장과 나의 생각",
  IMPRESSIVE_PART: "가장 인상 깊었던 부분",
  DISCUSSION_QUESTION: "함께 이야기하고 싶었던 질문",
} as const;

function formatEndedAt(value: string | null): string {
  if (value === null) return "종료 시간 확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function ResultLoading() {
  return (
    <div className="grid gap-8" aria-label="토론 기록을 만들고 있습니다" aria-busy="true">
      <div>
        <h2 className="text-page-title m-0">토론 기록을 정리하고 있어요</h2>
        <p className="text-body mt-2 mb-0 text-muted-foreground">
          핵심 쟁점과 서로 다른 관점을 차분히 묶고 있습니다.
        </p>
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid gap-3">
          <div className="h-5 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyListCopy({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-body m-0 text-muted-foreground">{children}</p>;
}

function DiscussionRecordView({ record }: Readonly<{ record: DiscussionRecord }>) {
  return (
    <article className="grid gap-12">
      <section aria-labelledby="issues-title">
        <span className="text-metadata font-semibold text-accent-strong">01</span>
        <h2 id="issues-title" className="text-page-title mt-2 mb-0">우리가 오래 머문 쟁점</h2>
        <div className="mt-6 grid gap-5">
          {record.keyIssues.map((issue, issueIndex) => (
            <section key={`${issue.title}-${issueIndex}`} className="rounded-xl border border-border bg-surface-elevated p-5 sm:p-6">
              <h3 className="text-section-title m-0">{issue.title}</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {issue.perspectives.map((perspective, perspectiveIndex) => (
                  <p key={perspectiveIndex} className="text-body m-0 rounded-lg bg-surface-muted p-4">
                    {perspective.summary}
                  </p>
                ))}
              </div>
              {issue.connections.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <h4 className="text-label m-0">이어진 생각</h4>
                  <ul className="text-body mt-2 mb-0 grid gap-2 pl-5 text-muted-foreground">
                    {issue.connections.map((connection, connectionIndex) => (
                      <li key={connectionIndex}>{connection}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="changes-title">
        <span className="text-metadata font-semibold text-accent-strong">02</span>
        <h2 id="changes-title" className="text-page-title mt-2 mb-0">새로 넓어진 생각</h2>
        {record.changesAndExpansions.length > 0 ? (
          <ul className="text-body mt-6 mb-0 grid list-none gap-3 p-0">
            {record.changesAndExpansions.map((change, index) => (
              <li key={index} className="border-l-2 border-accent px-4 py-2">{change}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-5"><EmptyListCopy>별도로 기록된 생각의 변화는 없습니다.</EmptyListCopy></div>
        )}
      </section>

      <section aria-labelledby="questions-title">
        <span className="text-metadata font-semibold text-accent-strong">03</span>
        <h2 id="questions-title" className="text-page-title mt-2 mb-0">남아 있는 질문</h2>
        {record.remainingQuestions.length > 0 ? (
          <ol className="text-body mt-6 mb-0 grid gap-4 pl-6">
            {record.remainingQuestions.map((question, index) => (
              <li key={index} className="pl-2">{question}</li>
            ))}
          </ol>
        ) : (
          <div className="mt-5"><EmptyListCopy>이번 기록에 남은 질문은 없습니다.</EmptyListCopy></div>
        )}
      </section>
    </article>
  );
}

function ClosingLines({ result }: Readonly<{ result: GetDiscussionResultResponse }>) {
  if (result.status !== "READY" || result.closingLines.length === 0) return null;
  return (
    <section aria-labelledby="closing-lines-title" className="mt-12 border-t border-border pt-10">
      <span className="text-metadata font-semibold text-accent-strong">04</span>
      <h2 id="closing-lines-title" className="text-page-title mt-2 mb-0">마지막 한 줄</h2>
      <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">
        {result.closingLines.map((line) => (
          <li key={line.responseId} className="rounded-xl bg-surface-muted p-5">
            <p className="text-body m-0 whitespace-pre-wrap">“{line.body}”</p>
            <span className="text-metadata mt-3 block text-muted-foreground">{line.profileName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReadOnlyPrep({ items }: Readonly<{ items: readonly PrepEntry[] }>) {
  const visibleItems = items.filter((entry) => entry.visibility === "PUBLIC" || entry.mine);
  const publicItems = visibleItems.filter((entry) => entry.visibility === "PUBLIC");
  const privateItems = visibleItems.filter(
    (entry) => entry.visibility === "AI_PRIVATE" && entry.mine,
  );
  if (visibleItems.length === 0) {
    return <EmptyListCopy>이 토론에 남겨진 사전 생각이 없습니다.</EmptyListCopy>;
  }
  return (
    <div className="grid gap-10">
      {publicItems.length > 0 && (
        <section aria-labelledby="public-prep-title">
          <h3 id="public-prep-title" className="text-section-title m-0">함께 본 준비</h3>
          <ul className="mt-4 mb-0 grid list-none gap-4 p-0">
            {publicItems.map((entry) => (
              <li key={entry.entryId} className="rounded-xl border border-border bg-surface-elevated p-5">
                <strong className="text-label">{prepPromptLabels[entry.promptType]}</strong>
                <p className="text-body mt-4 mb-0 whitespace-pre-wrap break-words">{entry.body}</p>
                <span className="text-metadata mt-3 block text-muted-foreground">
                  {entry.mine ? "나" : entry.authorProfileName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {privateItems.length > 0 && (
        <section aria-labelledby="private-prep-title">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="private-prep-title" className="text-section-title m-0">내 준비</h3>
            <Badge variant="outline"><LockKeyhole aria-hidden="true" className="size-3" />AI에게만 공개</Badge>
          </div>
          <ul className="mt-4 mb-0 grid list-none gap-4 p-0">
            {privateItems.map((entry) => (
              <li key={entry.entryId} className="rounded-xl border border-border bg-surface-muted p-5">
                <strong className="text-label">{prepPromptLabels[entry.promptType]}</strong>
                <p className="text-body mt-4 mb-0 whitespace-pre-wrap break-words">{entry.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type EndedDiscussionViewProps = Readonly<{
  roomId: string;
  snapshot: SessionSnapshot;
  controller: DiscussionSessionController;
  api: SessionApi;
  rooms: Pick<RoomApi, "getPrepEntries">;
}>;

export function EndedDiscussionView({
  roomId,
  snapshot,
  controller,
  api,
  rooms,
}: EndedDiscussionViewProps) {
  const [tab, setTab] = React.useState<ResultTab>("record");
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string>();
  const retryCommandId = React.useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const result = useQuery({
    queryKey: resultQueryKey(roomId),
    queryFn: () => api.getDiscussionResult(roomId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PENDING" || status === "PROCESSING" || status === "RETRYING"
        ? 3_000
        : false;
    },
  });
  const prep = useQuery({
    queryKey: prepResultQueryKey(roomId),
    queryFn: () => rooms.getPrepEntries(roomId),
    enabled: tab === "prep",
    retry: false,
  });
  const participants = snapshot.participants.filter(
    (participant) => participant.actualParticipation || participant.role === "HOST",
  );

  async function retryResult() {
    setRetrying(true);
    setRetryError(undefined);
    retryCommandId.current ??= createCommandId();
    try {
      await api.retryDiscussionResult(roomId, { commandId: retryCommandId.current });
      retryCommandId.current = undefined;
      await queryClient.invalidateQueries({ queryKey: resultQueryKey(roomId) });
    } catch (error) {
      setRetryError(
        error instanceof HttpClientError &&
          error.code === "DISCUSSION_RESULT_RETRY_UNAVAILABLE"
          ? "현재는 다시 만들 수 없습니다. 최신 상태를 확인해 주세요."
          : "토론 기록을 다시 요청하지 못했습니다.",
      );
    } finally {
      setRetrying(false);
    }
  }

  const tabs: ReadonlyArray<Readonly<{ id: ResultTab; label: string; icon: React.ReactNode }>> = [
    { id: "record", label: "오늘의 토론 기록", icon: <BookOpenText aria-hidden="true" /> },
    { id: "conversation", label: "전체 대화", icon: <MessagesSquare aria-hidden="true" /> },
    { id: "prep", label: "사전 입력", icon: <LockKeyhole aria-hidden="true" /> },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-7">
          <Button asChild variant="ghost" className="-ml-3 mb-4">
            <a href="/discussions"><ArrowLeft aria-hidden="true" />내 토론</a>
          </Button>
          <div className="flex items-start gap-4 sm:gap-5">
            <BookCover
              title={snapshot.room.bookTitle}
              size="lg"
              {...(snapshot.room.bookCoverUrl ? { src: snapshot.room.bookCoverUrl } : {})}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">종료</Badge>
                <span className="text-metadata text-muted-foreground">{formatEndedAt(snapshot.state.endedAt)}</span>
              </div>
              <h1 className="text-page-title mt-2 mb-0 break-keep">{snapshot.room.title}</h1>
              <p className="text-body mt-1 mb-0 text-muted-foreground">
                {snapshot.room.bookTitle} · {snapshot.room.bookAuthor}
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <IconButton label={`참가자 ${participants.length}명 보기`} variant="ghost">
                  <Users aria-hidden="true" />
                </IconButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>함께한 사람 {participants.length}명</DialogTitle>
                  <DialogDescription>이 토론에 실제로 참여한 사람입니다.</DialogDescription>
                </DialogHeader>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {participants.map((participant) => (
                    <li key={participant.userId} className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3">
                      <span className="text-body">{participant.profileName}</span>
                      {participant.role === "HOST" && <Badge variant="outline">방장</Badge>}
                    </li>
                  ))}
                </ul>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur" aria-label="토론 기록 메뉴">
        <div className="mx-auto flex max-w-4xl overflow-x-auto px-4 sm:px-6" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`result-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`result-panel-${item.id}`}
              className={`text-label inline-flex min-h-12 shrink-0 items-center gap-2 border-x-0 border-t-0 bg-transparent px-3 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${tab === item.id ? "border-b-2 border-b-foreground text-foreground" : "border-b-2 border-b-transparent text-muted-foreground"}`}
              onClick={() => setTab(item.id)}
            >
              <span className="[&_svg]:size-4">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6 sm:py-12">
        {tab === "record" && (
          <section id="result-panel-record" role="tabpanel" aria-labelledby="result-tab-record">
            {result.isPending && <ResultLoading />}
            {result.isError && (
              <div className="grid justify-items-start gap-4 rounded-xl border border-border bg-surface-elevated p-6">
                <h2 className="text-section-title m-0">토론 기록을 불러오지 못했습니다</h2>
                <Button onClick={() => void result.refetch()}><RefreshCw aria-hidden="true" />다시 불러오기</Button>
              </div>
            )}
            {result.data && ["PENDING", "PROCESSING", "RETRYING", "NOT_STARTED"].includes(result.data.status) && <ResultLoading />}
            {result.data?.status === "READY" && result.data.record && (
              <>
                <DiscussionRecordView record={result.data.record} />
                <ClosingLines result={result.data} />
              </>
            )}
            {result.data?.status === "INSUFFICIENT" && (
              <div className="rounded-xl bg-surface-muted p-6">
                <h2 className="text-section-title m-0">공식 토론 기록을 만들기 어려웠어요</h2>
                <p className="text-body mt-2 mb-0 text-muted-foreground">정리할 수 있는 대화가 충분하지 않았습니다. 전체 대화와 사전 입력은 그대로 볼 수 있어요.</p>
              </div>
            )}
            {result.data?.status === "FAILED" && (
              <div className="grid justify-items-start gap-4 rounded-xl border border-border bg-surface-elevated p-6">
                <div>
                  <h2 className="text-section-title m-0">토론 기록을 만들지 못했습니다</h2>
                  <p className="text-body mt-2 mb-0 text-muted-foreground">전체 대화와 사전 입력은 지금도 볼 수 있어요.</p>
                </div>
                {snapshot.actor.role === "HOST" && result.data.canRetry && (
                  <Button variant="primary" disabled={retrying} onClick={() => void retryResult()}>
                    <RefreshCw aria-hidden="true" />{retrying ? "다시 요청 중" : "기록 다시 만들기"}
                  </Button>
                )}
                {retryError && <p role="alert" className="text-caption m-0 text-destructive">{retryError}</p>}
              </div>
            )}
          </section>
        )}

        {tab === "conversation" && (
          <section id="result-panel-conversation" role="tabpanel" aria-labelledby="result-tab-conversation" className="-mx-4 sm:-mx-6">
            <SessionMessageTimeline
              snapshot={snapshot}
              controller={controller}
              typingNames={[]}
              readOnly
              showPending={false}
            />
          </section>
        )}

        {tab === "prep" && (
          <section id="result-panel-prep" role="tabpanel" aria-labelledby="result-tab-prep">
            <div className="mb-7">
              <h2 className="text-page-title m-0">토론 전에 남긴 생각</h2>
              <p className="text-body mt-2 mb-0 text-muted-foreground">공개된 내용과 내가 AI에게만 남긴 내용을 읽을 수 있어요.</p>
            </div>
            {prep.isPending && <div className="h-32 animate-pulse rounded-xl bg-surface-muted" aria-label="사전 입력 불러오는 중" />}
            {prep.isError && (
              <div className="grid justify-items-start gap-3 rounded-xl bg-surface-muted p-5">
                <p className="text-body m-0">사전 입력을 불러오지 못했습니다.</p>
                <Button onClick={() => void prep.refetch()}>다시 시도</Button>
              </div>
            )}
            {prep.data && <ReadOnlyPrep items={prep.data.items} />}
          </section>
        )}
      </main>
    </div>
  );
}
