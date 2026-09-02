import * as React from "react";
import type { BookCatalogItem, BookCatalogSort } from "@bookseasoning/contracts/public";
import { ArrowLeft, Eye, EyeOff, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { BookCover } from "../../components/book/book-cover";
import { Button, IconButton } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useBookCatalogQuery } from "../books/book-query";
import { HttpClientError } from "../../data/http-client";
import { createCommandId } from "../../lib/command-id";
import { cn } from "../../lib/utils";
import { formatRoomDate } from "./room-presenters";
import { useCreateRoomMutation } from "./room-query";
import { RoomCapacityStepper } from "./room-capacity-stepper";

type Step = 1 | 2 | 3;
type RoomDraft = Readonly<{
  title: string;
  scheduledStartAt: string;
  password: string;
  minParticipants: number;
  maxParticipants: number;
}>;
type DraftErrors = Partial<Record<keyof RoomDraft, string>>;

const initialDraft: RoomDraft = {
  title: "",
  scheduledStartAt: "",
  password: "",
  minParticipants: 2,
  maxParticipants: 6,
};

function StepHeader({ step }: Readonly<{ step: Step }>) {
  const labels: Record<Step, string> = { 1: "책 선택", 2: "토론 정보", 3: "확인" };
  return (
    <div className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-4">
      <strong className="text-section-title">{labels[step]}</strong>
      <span className="text-metadata text-muted-foreground">{step} / 3</span>
    </div>
  );
}

function BookSelection({
  selected,
  onSelect,
}: Readonly<{ selected: BookCatalogItem | null; onSelect(book: BookCatalogItem): void }>) {
  const [query, setQuery] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [sort, setSort] = React.useState<BookCatalogSort>("recent");
  const catalog = useBookCatalogQuery({ query: submittedQuery, sort, limit: 20 });

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <form
          role="search"
          className="grid grid-cols-[minmax(0,1fr)_44px] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query.trim());
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="책 제목, 저자 검색" aria-label="책 제목, 저자 검색" />
          <IconButton label="책 검색" variant="primary" type="submit"><Search aria-hidden="true" /></IconButton>
        </form>
        <Select value={sort} onValueChange={(value) => setSort(value as BookCatalogSort)}>
          <SelectTrigger aria-label="책 정렬"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">최근 추가된 순</SelectItem>
            <SelectItem value="title">제목 가나다순</SelectItem>
            <SelectItem value="author">저자 가나다순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {catalog.isPending && (
        <div className="grid gap-3" aria-busy="true" aria-label="책 불러오는 중">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-surface-muted" />)}
        </div>
      )}
      {catalog.isError && (
        <div className="grid justify-items-start gap-3 rounded-lg bg-surface p-6">
          <p className="text-body m-0">책 목록을 불러오지 못했습니다.</p>
          <Button onClick={() => void catalog.refetch()}>다시 시도</Button>
        </div>
      )}
      {catalog.isSuccess && catalog.data.items.length === 0 && (
        <div className="grid place-items-center rounded-lg bg-surface py-14 text-center">
          <p className="text-body m-0 text-muted-foreground">아직 토론이 준비된 책이 없습니다</p>
        </div>
      )}
      {catalog.isSuccess && catalog.data.items.length > 0 && (
        <div className="grid gap-3">
          {catalog.data.items.map((book) => {
            const isSelected = selected?.packVersionId === book.packVersionId;
            return (
              <button
                key={book.packVersionId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(book)}
                className={cn(
                  "grid w-full grid-cols-[48px_minmax(0,1fr)] gap-4 rounded-lg border bg-surface-elevated p-4 text-left transition-colors",
                  isSelected ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-border-strong",
                )}
              >
                <BookCover title={book.title} src={book.coverUrl ?? undefined} size="md" className="h-[68px] w-12" />
                <span className="min-w-0">
                  <strong className="block text-[16px] leading-6">{book.title}</strong>
                  <span className="text-metadata mt-0.5 block text-muted-foreground">{book.author}</span>
                  <span className="text-caption mt-2 block text-muted-foreground">{book.publisher} · {book.publicationYear}</span>
                  {isSelected && <span className="text-body mt-3 block text-foreground">{book.shortDescription}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DraftField({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<typeof Input> & Readonly<{ label: string; error?: string }>) {
  return (
    <label htmlFor={id} className="grid gap-2 text-label">
      <span>{label}</span>
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && <span id={`${id}-error`} role="alert" className="text-caption text-destructive">{error}</span>}
    </label>
  );
}

function validateDraft(draft: RoomDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = "방 제목을 입력해 주세요.";
  if (!draft.scheduledStartAt || Number.isNaN(Date.parse(draft.scheduledStartAt))) {
    errors.scheduledStartAt = "시작 예정 시각을 선택해 주세요.";
  }
  if (draft.password.length < 4 || draft.password.length > 20) {
    errors.password = "참가 패스워드는 4~20자로 입력해 주세요.";
  }
  if (draft.minParticipants > draft.maxParticipants) {
    errors.minParticipants = "최소 인원은 최대 인원보다 클 수 없습니다.";
  }
  return errors;
}

export function CreateRoomPage() {
  const navigate = useNavigate();
  const createRoom = useCreateRoomMutation();
  const [step, setStep] = React.useState<Step>(1);
  const [selectedBook, setSelectedBook] = React.useState<BookCatalogItem | null>(null);
  const [draft, setDraft] = React.useState<RoomDraft>(initialDraft);
  const [errors, setErrors] = React.useState<DraftErrors>({});
  const [showPassword, setShowPassword] = React.useState(false);
  const [commandId, setCommandId] = React.useState<string>();
  const [submitError, setSubmitError] = React.useState<string>();

  function changeDraft<Key extends keyof RoomDraft>(key: Key, value: RoomDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setCommandId(undefined);
    createRoom.reset();
  }

  function nextFromDetails() {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setStep(3);
  }

  async function submit() {
    if (!selectedBook) return;
    setSubmitError(undefined);
    const nextCommandId = commandId ?? createCommandId();
    setCommandId(nextCommandId);
    try {
      const response = await createRoom.mutateAsync({
        commandId: nextCommandId,
        payload: {
          title: draft.title.trim(),
          packVersionId: selectedBook.packVersionId,
          scheduledStartAt: new Date(draft.scheduledStartAt).toISOString(),
          password: draft.password,
          minParticipants: draft.minParticipants,
          maxParticipants: draft.maxParticipants,
        },
      });
      navigate(`/rooms/${response.roomId}`, { replace: true, state: { created: true } });
    } catch (error) {
      if (error instanceof HttpClientError && error.code === "PUBLISHED_PACK_REQUIRED") {
        setSubmitError("토론에 사용할 수 있는 책을 다시 선택해 주세요.");
      } else if (error instanceof HttpClientError && error.code === "INVALID_ROOM_CAPACITY") {
        setSubmitError("참가 인원 설정을 확인해 주세요.");
      } else {
        setSubmitError("토론을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  return (
    <main className="px-5 pb-20 sm:px-8">
      <section className="mx-auto max-w-3xl pt-10 sm:pt-14">
        <header className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-page-title m-0">토론 만들기</h1>
          <Button asChild variant="ghost"><Link to="/discussions">취소</Link></Button>
        </header>
        <StepHeader step={step} />

        {step === 1 && (
          <>
            <BookSelection selected={selectedBook} onSelect={(book) => { setSelectedBook(book); setCommandId(undefined); }} />
            <div className="mt-8 flex justify-end">
              <Button variant="primary" size="lg" disabled={!selectedBook} onClick={() => setStep(2)}>다음</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="grid gap-7">
            <DraftField id="room-title" label="방 제목" value={draft.title} onChange={(event) => changeDraft("title", event.target.value)} maxLength={200} required error={errors.title} />
            <DraftField id="scheduled-start" label="시작 예정 시각" type="datetime-local" value={draft.scheduledStartAt} onChange={(event) => changeDraft("scheduledStartAt", event.target.value)} required error={errors.scheduledStartAt} />
            <label htmlFor="room-password" className="grid gap-2 text-label">
              <span>참가 패스워드</span>
              <span className="grid grid-cols-[minmax(0,1fr)_44px] rounded-md border border-border-strong bg-surface-elevated focus-within:ring-2 focus-within:ring-focus-ring">
                <Input id="room-password" type={showPassword ? "text" : "password"} value={draft.password} onChange={(event) => changeDraft("password", event.target.value)} minLength={4} maxLength={20} autoComplete="new-password" className="border-0 focus-visible:ring-0" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "room-password-error" : undefined} />
                <IconButton label={showPassword ? "참가 패스워드 숨기기" : "참가 패스워드 보기"} variant="ghost" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </IconButton>
              </span>
              {errors.password && <span id="room-password-error" role="alert" className="text-caption text-destructive">{errors.password}</span>}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <RoomCapacityStepper id="minimum-participants" label="최소 참가 인원" value={draft.minParticipants} onChange={(value) => changeDraft("minParticipants", value)} />
              <RoomCapacityStepper id="maximum-participants" label="최대 참가 인원" value={draft.maxParticipants} onChange={(value) => changeDraft("maxParticipants", value)} />
            </div>
            {errors.minParticipants && <p role="alert" className="text-caption m-0 text-destructive">{errors.minParticipants}</p>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <IconButton label="책 선택으로 돌아가기" variant="ghost" onClick={() => setStep(1)}><ArrowLeft aria-hidden="true" /></IconButton>
              <Button variant="primary" size="lg" onClick={nextFromDetails}>다음</Button>
            </div>
          </div>
        )}

        {step === 3 && selectedBook && (
          <div className="grid gap-8">
            <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-5 rounded-xl bg-surface p-5">
              <BookCover title={selectedBook.title} src={selectedBook.coverUrl ?? undefined} size="lg" />
              <div className="min-w-0 self-center">
                <strong className="block text-[17px] leading-6">{selectedBook.title}</strong>
                <span className="text-metadata mt-1 block text-muted-foreground">{selectedBook.author}</span>
              </div>
            </div>
            <dl className="m-0 grid border-t border-border">
              {[
                ["방 제목", draft.title.trim()],
                ["시작 예정", formatRoomDate(new Date(draft.scheduledStartAt).toISOString())],
                ["참가 인원", `최소 ${draft.minParticipants}명 · 최대 ${draft.maxParticipants}명`],
              ].map(([label, value]) => (
                <div key={label} className="grid min-h-16 grid-cols-[100px_minmax(0,1fr)] items-center gap-4 border-b border-border">
                  <dt className="text-body text-muted-foreground">{label}</dt><dd className="m-0 text-body font-medium">{value}</dd>
                </div>
              ))}
              <div className="grid min-h-16 grid-cols-[100px_minmax(0,1fr)_44px] items-center gap-4 border-b border-border">
                <dt className="text-body text-muted-foreground">패스워드</dt>
                <dd className="m-0 truncate text-body font-medium">{showPassword ? draft.password : "•".repeat(draft.password.length)}</dd>
                <IconButton label={showPassword ? "참가 패스워드 숨기기" : "참가 패스워드 보기"} variant="ghost" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </IconButton>
              </div>
            </dl>
            {submitError && <p role="alert" className="text-body m-0 text-destructive">{submitError}</p>}
            <div className="flex items-center justify-between gap-3">
              <IconButton label="토론 정보로 돌아가기" variant="ghost" onClick={() => { setStep(2); setSubmitError(undefined); }}><ArrowLeft aria-hidden="true" /></IconButton>
              <Button variant="primary" size="lg" disabled={createRoom.isPending} onClick={() => void submit()}>
                {createRoom.isPending ? "만드는 중" : "토론 만들기"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
