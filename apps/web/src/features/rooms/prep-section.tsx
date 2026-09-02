import * as React from "react";
import type {
  PrepEntry,
  PrepPromptType,
  PrepVisibility,
} from "@bookseasoning/contracts/public";
import { LockKeyhole, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";

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
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { HttpClientError } from "../../data/http-client";
import { createCommandId } from "../../lib/command-id";
import {
  useDeletePrepEntryMutation,
  usePrepEntriesQuery,
  useUpsertPrepEntryMutation,
} from "./room-query";

const promptLabels: Record<PrepPromptType, string> = {
  QUOTE_THOUGHT: "좋아했던 문장과 나의 생각",
  IMPRESSIVE_PART: "가장 인상 깊었던 부분",
  DISCUSSION_QUESTION: "함께 이야기하고 싶은 질문",
};

type PrepDraft = Readonly<{
  entryId: string;
  expectedRevision?: number;
  promptType: PrepPromptType;
  visibility: PrepVisibility;
  body: string;
}>;

function newDraft(): PrepDraft {
  return {
    entryId: createCommandId(),
    promptType: "QUOTE_THOUGHT",
    visibility: "PUBLIC",
    body: "",
  };
}

function entryDraft(entry: PrepEntry): PrepDraft {
  return {
    entryId: entry.entryId,
    expectedRevision: entry.revision,
    promptType: entry.promptType,
    visibility: entry.visibility,
    body: entry.body,
  };
}

function PrepEntryRow({
  entry,
  onEdit,
  onDelete,
}: Readonly<{
  entry: PrepEntry;
  onEdit(entry: PrepEntry): void;
  onDelete(entry: PrepEntry): void;
}>) {
  return (
    <li className="grid gap-3 border-b border-border py-5 first:border-t">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-label">{promptLabels[entry.promptType]}</strong>
            {entry.visibility === "AI_PRIVATE" ? (
              <Badge variant="outline"><LockKeyhole aria-hidden="true" className="size-3" />AI에게만</Badge>
            ) : (
              <Badge variant="neutral"><UsersRound aria-hidden="true" className="size-3" />함께 보기</Badge>
            )}
          </div>
          <span className="text-metadata mt-1 block text-muted-foreground">{entry.authorProfileName}</span>
        </div>
        {entry.mine && (
          <div className="flex shrink-0 gap-1">
            <IconButton label="사전 생각 수정" variant="ghost" onClick={() => onEdit(entry)}><Pencil aria-hidden="true" /></IconButton>
            <IconButton label="사전 생각 삭제" variant="ghost" onClick={() => onDelete(entry)}><Trash2 aria-hidden="true" /></IconButton>
          </div>
        )}
      </div>
      <p className="text-body m-0 whitespace-pre-wrap break-words">{entry.body}</p>
    </li>
  );
}

export function PrepSection({ roomId }: Readonly<{ roomId: string }>) {
  const entries = usePrepEntriesQuery(roomId, true);
  const upsert = useUpsertPrepEntryMutation(roomId);
  const remove = useDeletePrepEntryMutation(roomId);
  const [draft, setDraft] = React.useState<PrepDraft | null>(null);
  const [commandId, setCommandId] = React.useState<string>();
  const [formError, setFormError] = React.useState<string>();
  const [deleteTarget, setDeleteTarget] = React.useState<PrepEntry | null>(null);
  const [deleteCommandId, setDeleteCommandId] = React.useState<string>();
  const [deleteError, setDeleteError] = React.useState<string>();

  function changeDraft(change: Partial<PrepDraft>) {
    setDraft((current) => current ? { ...current, ...change } : current);
    setCommandId(undefined);
    setFormError(undefined);
    upsert.reset();
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.body.trim()) {
      setFormError("생각을 한 줄 이상 입력해 주세요.");
      return;
    }
    const nextCommandId = commandId ?? createCommandId();
    setCommandId(nextCommandId);
    try {
      await upsert.mutateAsync({
        commandId: nextCommandId,
        payload: {
          entryId: draft.entryId,
          expectedRevision: draft.expectedRevision,
          promptType: draft.promptType,
          visibility: draft.visibility,
          body: draft.body.trim(),
        },
      });
      setDraft(null);
      setCommandId(undefined);
    } catch (error) {
      if (error instanceof HttpClientError && error.code === "PREP_REVISION_CONFLICT") {
        setFormError("다른 변경사항이 반영되었습니다. 목록을 확인한 뒤 다시 수정해 주세요.");
        await entries.refetch();
      } else if (error instanceof HttpClientError && error.code === "PREP_WRITE_NOT_ALLOWED") {
        setFormError("토론이 시작되어 사전 생각을 더 이상 변경할 수 없습니다.");
      } else {
        setFormError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const nextCommandId = deleteCommandId ?? createCommandId();
    setDeleteCommandId(nextCommandId);
    setDeleteError(undefined);
    try {
      await remove.mutateAsync({
        commandId: nextCommandId,
        payload: {
          entryId: deleteTarget.entryId,
          expectedRevision: deleteTarget.revision,
        },
      });
      setDeleteTarget(null);
      setDeleteCommandId(undefined);
    } catch (error) {
      setDeleteError(
        error instanceof HttpClientError && error.code === "PREP_REVISION_CONFLICT"
          ? "이미 변경된 항목입니다. 목록을 새로 확인해 주세요."
          : "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  return (
    <section aria-labelledby="prep-title" className="pt-4">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h2 id="prep-title" className="text-section-title m-0">토론 전에 생각해 보기</h2>
          <p className="text-body mt-2 mb-0 max-w-xl text-muted-foreground">
            떠오른 생각을 가볍게 남겨보세요.<br />작성하지 않아도 토론에 참여할 수 있어요.
          </p>
        </div>
        {!draft && (
          <IconButton label="사전 생각 남기기" variant="secondary" onClick={() => setDraft(newDraft())}>
            <Plus aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {draft && (
        <div className="mt-6 grid gap-5 rounded-xl border border-border bg-surface-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-body">{draft.expectedRevision ? "생각 수정" : "생각 남기기"}</strong>
            <IconButton label="작성 취소" variant="ghost" onClick={() => { setDraft(null); setFormError(undefined); }}><X aria-hidden="true" /></IconButton>
          </div>
          <label className="grid gap-2 text-label">
            <span>질문</span>
            <Select value={draft.promptType} onValueChange={(value) => changeDraft({ promptType: value as PrepPromptType })}>
              <SelectTrigger aria-label="사전 질문"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(promptLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label htmlFor="prep-body" className="grid gap-2 text-label">
            <span>내 생각</span>
            <Textarea id="prep-body" value={draft.body} maxLength={4000} rows={5} aria-invalid={Boolean(formError)} aria-describedby={formError ? "prep-form-error" : undefined} onChange={(event) => changeDraft({ body: event.target.value })} />
          </label>
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="text-label mb-2">공개 범위</legend>
            <RadioGroup value={draft.visibility} onValueChange={(value) => changeDraft({ visibility: value as PrepVisibility })} className="sm:grid-cols-2">
              <label className="flex min-h-16 items-center gap-3 rounded-lg border border-border p-3 text-body">
                <RadioGroupItem value="PUBLIC" aria-label="함께 보기" />
                <span><strong className="block text-[14px]">함께 보기</strong><span className="text-caption text-muted-foreground">대기실 참가자에게 공개</span></span>
              </label>
              <label className="flex min-h-16 items-center gap-3 rounded-lg border border-border p-3 text-body">
                <RadioGroupItem value="AI_PRIVATE" aria-label="AI에게만" />
                <span><strong className="block text-[14px]">AI에게만</strong><span className="text-caption text-muted-foreground">다른 참가자에게 비공개</span></span>
              </label>
            </RadioGroup>
          </fieldset>
          {formError && <p id="prep-form-error" role="alert" className="text-caption m-0 text-destructive">{formError}</p>}
          <div className="flex justify-end"><Button variant="primary" disabled={upsert.isPending} onClick={() => void saveDraft()}>{upsert.isPending ? "저장 중" : "저장"}</Button></div>
        </div>
      )}

      {entries.isPending && <div className="mt-6 h-28 animate-pulse rounded-xl bg-surface-muted" aria-label="사전 생각 불러오는 중" />}
      {entries.isError && (
        <div className="mt-6 grid justify-items-start gap-3 rounded-xl bg-surface p-5">
          <p className="text-body m-0">사전 생각을 불러오지 못했습니다.</p>
          <Button onClick={() => void entries.refetch()}>다시 시도</Button>
        </div>
      )}
      {entries.isSuccess && entries.data.items.length === 0 && !draft && (
        <p className="text-body mt-7 mb-0 rounded-xl bg-surface p-5 text-muted-foreground">아직 남겨진 생각이 없습니다.</p>
      )}
      {entries.isSuccess && entries.data.items.length > 0 && (
        <ul className="mt-7 mb-0 list-none p-0">
          {entries.data.items.map((entry) => (
            <PrepEntryRow key={entry.entryId} entry={entry} onEdit={(item) => { setDraft(entryDraft(item)); setFormError(undefined); setCommandId(undefined); }} onDelete={(item) => { setDeleteTarget(item); setDeleteError(undefined); setDeleteCommandId(undefined); }} />
          ))}
        </ul>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 생각을 삭제할까요?</DialogTitle>
            <DialogDescription>삭제한 내용은 다시 복구할 수 없습니다.</DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="text-caption m-0 text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button disabled={remove.isPending} onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => void confirmDelete()}>{remove.isPending ? "삭제 중" : "삭제"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
