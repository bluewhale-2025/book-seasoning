import * as React from "react";
import type { SessionSnapshot } from "@bookseasoning/contracts/public";
import { Check, LockKeyhole, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button, IconButton } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { HttpClientError } from "../../data/http-client";
import type { SessionApi } from "../../data/session-api";
import { createCommandId } from "../../lib/command-id";

type ClosingResponsePanelProps = Readonly<{
  roomId: string;
  snapshot: SessionSnapshot;
  api: SessionApi;
  onRecover(): Promise<void>;
}>;

function closingErrorMessage(error: unknown): string {
  if (error instanceof HttpClientError) {
    if (
      error.code === "CLOSING_REVISION_CONFLICT" ||
      error.code === "PHASE_VERSION_CONFLICT"
    ) {
      return "마감 상태가 변경되었습니다. 최신 내용을 확인해 주세요.";
    }
    if (error.code === "CLOSING_RESPONSE_LOCKED") {
      return "마지막 한 줄 입력 시간이 종료되었습니다.";
    }
  }
  return "반영하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
}

export function ClosingResponsePanel({
  roomId,
  snapshot,
  api,
  onRecover,
}: ClosingResponsePanelProps) {
  const response = snapshot.closing?.actorResponse ?? null;
  const [body, setBody] = React.useState(response?.body ?? "");
  const [busy, setBusy] = React.useState<"save" | "skip" | "delete" | null>(null);
  const [error, setError] = React.useState<string>();
  const commandRef = React.useRef<{ signature: string; id: string } | undefined>(undefined);

  React.useEffect(() => {
    setBody(response?.body ?? "");
  }, [response?.body, response?.revision, response?.status]);

  if (!snapshot.actor.actualParticipation || snapshot.closing === null) {
    return (
      <div className="border-t border-border bg-surface px-4 py-6 text-center sm:px-6">
        <p className="text-body m-0 text-muted-foreground">
          참가자들이 마지막 생각을 정리하고 있습니다.
        </p>
      </div>
    );
  }

  const trimmedBody = body.trim();
  const unchanged = response?.status === "SUBMITTED" && response.body === trimmedBody;

  function commandId(signature: string): string {
    if (commandRef.current?.signature === signature) return commandRef.current.id;
    const id = createCommandId();
    commandRef.current = { signature, id };
    return id;
  }

  async function run(action: "save" | "skip" | "delete") {
    setBusy(action);
    setError(undefined);
    try {
      if (action === "delete") {
        if (!response || response.revision < 1) return;
        await api.deleteClosingResponse(roomId, {
          commandId: commandId(`delete:${response.revision}`),
          expectedPhaseVersion: snapshot.state.phaseVersion,
          expectedRevision: response.revision,
        });
      } else {
        const status = action === "save" ? "SUBMITTED" : "SKIPPED";
        const nextBody = action === "save" ? trimmedBody : null;
        await api.upsertClosingResponse(roomId, {
          commandId: commandId(`${status}:${response?.revision ?? 0}:${nextBody ?? ""}`),
          expectedPhaseVersion: snapshot.state.phaseVersion,
          expectedRevision: response?.revision ?? 0,
          status,
          body: nextBody,
        });
      }
      commandRef.current = undefined;
      await onRecover();
    } catch (caught) {
      setError(closingErrorMessage(caught));
      await onRecover().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  if (response?.status === "SKIPPED") {
    return (
      <section className="border-t border-border bg-surface-elevated px-4 py-7 sm:px-6" aria-labelledby="closing-title">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-xl bg-surface-muted p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="closing-title" className="text-label m-0 inline-flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 text-accent-strong" />
              건너뛰기를 선택했습니다
            </h2>
            <p className="text-caption mt-1 mb-0 text-muted-foreground">
              마감 전에는 다시 한 줄을 남길 수 있어요.
            </p>
          </div>
          <Button disabled={busy !== null} onClick={() => void run("delete")}>
            <RotateCcw aria-hidden="true" />
            다시 작성
          </Button>
        </div>
        {error && <p role="alert" className="text-caption mx-auto mt-3 mb-0 max-w-2xl text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="border-t border-border bg-surface-elevated px-4 py-7 sm:px-6" aria-labelledby="closing-title">
      <div className="mx-auto grid max-w-2xl gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="closing-title" className="text-section-title m-0">마지막으로 남기고 싶은 한 줄</h2>
            <p className="text-body mt-2 mb-0 text-muted-foreground">
              오늘의 토론에서 가져갈 생각을 남겨보세요.<br />작성하지 않아도 괜찮아요.
            </p>
          </div>
          <Badge variant="outline">
            {snapshot.closing.completedParticipantCount}/{snapshot.closing.eligibleParticipantCount} 완료
          </Badge>
        </div>

        <label className="grid gap-2">
          <span className="sr-only">마지막 한 줄</span>
          <Textarea
            aria-label="마지막 한 줄"
            value={body}
            maxLength={300}
            rows={3}
            placeholder="한 문장으로 정리해 보세요"
            disabled={busy !== null}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "closing-error" : "closing-privacy"}
            onChange={(event) => {
              setBody(event.target.value);
              setError(undefined);
              commandRef.current = undefined;
            }}
          />
          <span className="text-caption text-right text-muted-foreground">{body.length}/300</span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="closing-privacy" className="text-caption m-0 inline-flex items-center gap-1.5 text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            다른 사람의 답변은 마감 전까지 보이지 않아요.
          </p>
          <div className="flex justify-end gap-2">
            {response?.status === "SUBMITTED" && (
              <IconButton
                label="마지막 한 줄 삭제"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void run("delete")}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            )}
            <Button disabled={busy !== null} onClick={() => void run("skip")}>건너뛰기</Button>
            <Button
              variant="primary"
              disabled={busy !== null || trimmedBody.length === 0 || unchanged}
              onClick={() => void run("save")}
            >
              {busy === "save" ? "저장 중" : response?.status === "SUBMITTED" ? "수정 저장" : "저장"}
            </Button>
          </div>
        </div>
        {response?.status === "SUBMITTED" && !error && (
          <p role="status" className="text-caption m-0 inline-flex items-center gap-1.5 text-accent-strong">
            <Check aria-hidden="true" className="size-4" /> 저장되었습니다
          </p>
        )}
        {error && <p id="closing-error" role="alert" className="text-caption m-0 text-destructive">{error}</p>}
      </div>
    </section>
  );
}
