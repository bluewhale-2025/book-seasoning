import * as React from "react";
import type { RoomDetail, UpdateRoomRequest } from "@bookseasoning/contracts/public";
import { Eye, EyeOff, Settings } from "lucide-react";

import { Button, IconButton } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { HttpClientError } from "../../data/http-client";
import { useBookCatalogQuery } from "../books/book-query";
import { createCommandId } from "../../lib/command-id";
import { RoomCapacityStepper } from "./room-capacity-stepper";
import { useUpdateRoomMutation } from "./room-query";

type SettingsDraft = Readonly<{
  title: string;
  scheduledStartAt: string;
  password: string;
  minParticipants: number;
  maxParticipants: number;
  packVersionId: string;
}>;

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialDraft(detail: RoomDetail): SettingsDraft {
  return {
    title: detail.title,
    scheduledStartAt: toLocalDateTime(detail.scheduledStartAt),
    password: "",
    minParticipants: detail.minParticipants,
    maxParticipants: detail.maxParticipants,
    packVersionId: detail.packVersionId,
  };
}

export function RoomSettingsDialog({
  detail,
  onRefresh,
}: Readonly<{ detail: RoomDetail; onRefresh(): Promise<unknown> }>) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<SettingsDraft>(() => initialDraft(detail));
  const [commandId, setCommandId] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [showPassword, setShowPassword] = React.useState(false);
  const mutation = useUpdateRoomMutation(detail.roomId);
  const prestart = detail.displayStatus === "SCHEDULED" || detail.displayStatus === "WAITING";
  const canChangeBook = prestart && detail.participantCount === 1;
  const books = useBookCatalogQuery({ query: "", sort: "recent", limit: 50 }, open && canChangeBook);

  function reset() {
    setDraft(initialDraft(detail));
    setCommandId(undefined);
    setError(undefined);
    setShowPassword(false);
    mutation.reset();
  }

  function change<Key extends keyof SettingsDraft>(key: Key, value: SettingsDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setCommandId(undefined);
    setError(undefined);
    mutation.reset();
  }

  function buildPayload(): UpdateRoomRequest["payload"] | null {
    const payload: Record<string, unknown> = {};
    if (prestart && draft.title.trim() !== detail.title) payload.title = draft.title.trim();
    const scheduledStartAt = new Date(draft.scheduledStartAt).toISOString();
    if (prestart && scheduledStartAt !== detail.scheduledStartAt) payload.scheduledStartAt = scheduledStartAt;
    if (draft.password) payload.password = draft.password;
    if (prestart && draft.minParticipants !== detail.minParticipants) payload.minParticipants = draft.minParticipants;
    if (draft.maxParticipants !== detail.maxParticipants) payload.maxParticipants = draft.maxParticipants;
    if (canChangeBook && draft.packVersionId !== detail.packVersionId) payload.packVersionId = draft.packVersionId;
    return Object.keys(payload).length > 0 ? payload as UpdateRoomRequest["payload"] : null;
  }

  async function submit() {
    if (prestart && !draft.title.trim()) {
      setError("방 제목을 입력해 주세요.");
      return;
    }
    if (prestart && (!draft.scheduledStartAt || Number.isNaN(Date.parse(draft.scheduledStartAt)))) {
      setError("시작 예정 시각을 확인해 주세요.");
      return;
    }
    if (draft.password && (draft.password.length < 4 || draft.password.length > 20)) {
      setError("새 참가 패스워드는 4~20자로 입력해 주세요.");
      return;
    }
    if (
      draft.minParticipants > draft.maxParticipants ||
      draft.maxParticipants < detail.participantCount ||
      (!prestart && draft.maxParticipants < detail.maxParticipants)
    ) {
      setError("현재 참가 인원을 포함하도록 최소·최대 인원을 확인해 주세요.");
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      setError("변경된 설정이 없습니다.");
      return;
    }
    const nextCommandId = commandId ?? createCommandId();
    setCommandId(nextCommandId);
    try {
      await mutation.mutateAsync({
        commandId: nextCommandId,
        expectedVersion: detail.aggregateVersion,
        payload,
      });
      setOpen(false);
    } catch (caught) {
      const code = caught instanceof HttpClientError ? caught.code : "UNKNOWN";
      if (code === "AGGREGATE_VERSION_CONFLICT") {
        setError("다른 변경사항이 반영되었습니다. 최신 설정을 다시 확인해 주세요.");
        setCommandId(undefined);
        await onRefresh();
      } else if (code === "ROOM_BOOK_LOCKED") {
        setError("참가자가 등록되어 책은 더 이상 변경할 수 없습니다.");
      } else if (code === "INVALID_ROOM_CAPACITY") {
        setError("참가 인원 설정을 확인해 주세요.");
      } else {
        setError("설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) reset(); }}>
      <DialogTrigger asChild>
        <IconButton label="방 설정" variant="ghost"><Settings aria-hidden="true" /></IconButton>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>방 설정</DialogTitle>
          <DialogDescription>{prestart ? "시작 전까지 토론방 정보를 변경할 수 있습니다." : "진행 중에는 새 참가 패스워드와 최대 인원만 변경할 수 있습니다."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {prestart && <label htmlFor="settings-title" className="grid gap-2 text-label">
            <span>방 제목</span>
            <Input id="settings-title" value={draft.title} onChange={(event) => change("title", event.target.value)} />
          </label>}
          {prestart && <label htmlFor="settings-start" className="grid gap-2 text-label">
            <span>시작 예정 시각</span>
            <Input id="settings-start" type="datetime-local" value={draft.scheduledStartAt} onChange={(event) => change("scheduledStartAt", event.target.value)} />
          </label>}
          {prestart && <label className="grid gap-2 text-label">
            <span>책</span>
            <Select value={draft.packVersionId} disabled={!canChangeBook || books.isPending} onValueChange={(value) => change("packVersionId", value)}>
              <SelectTrigger aria-label="토론 책"><SelectValue placeholder={detail.bookTitle} /></SelectTrigger>
              <SelectContent>
                {!books.data?.items.some((book) => book.packVersionId === detail.packVersionId) && <SelectItem value={detail.packVersionId}>{detail.bookTitle} · {detail.bookAuthor}</SelectItem>}
                {books.data?.items.map((book) => <SelectItem key={book.packVersionId} value={book.packVersionId}>{book.title} · {book.author}</SelectItem>)}
              </SelectContent>
            </Select>
            {!canChangeBook && <span className="text-caption text-muted-foreground">참가자가 등록되어 현재 책으로 고정되었습니다.</span>}
          </label>}
          <label htmlFor="settings-password" className="grid gap-2 text-label">
            <span>새 참가 패스워드</span>
            <span className="grid grid-cols-[minmax(0,1fr)_44px] rounded-md border border-border-strong bg-surface-elevated focus-within:ring-2 focus-within:ring-focus-ring">
              <Input id="settings-password" type={showPassword ? "text" : "password"} value={draft.password} minLength={4} maxLength={20} autoComplete="new-password" placeholder="변경할 때만 입력" className="border-0 focus-visible:ring-0" onChange={(event) => change("password", event.target.value)} />
              <IconButton label={showPassword ? "새 참가 패스워드 숨기기" : "새 참가 패스워드 보기"} variant="ghost" onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</IconButton>
            </span>
          </label>
          <div className={`grid gap-4 ${prestart ? "sm:grid-cols-2" : ""}`}>
            {prestart && <RoomCapacityStepper id="settings-minimum" label="최소 참가 인원" value={draft.minParticipants} onChange={(value) => change("minParticipants", value)} />}
            <RoomCapacityStepper id="settings-maximum" label="최대 참가 인원" value={draft.maxParticipants} minimum={prestart ? 2 : detail.maxParticipants} onChange={(value) => change("maxParticipants", value)} />
          </div>
          {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={mutation.isPending} onClick={() => setOpen(false)}>취소</Button>
          <Button variant="primary" disabled={mutation.isPending} onClick={() => void submit()}>{mutation.isPending ? "저장 중" : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
