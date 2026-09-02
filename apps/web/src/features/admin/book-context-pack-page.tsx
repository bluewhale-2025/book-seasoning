import * as React from "react";
import type { AdminBookContextPackSnapshot } from "@bookseasoning/contracts/admin";
import { ArrowLeft, Check, CircleAlert, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button, IconButton } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { HttpClientError } from "../../data/http-client";
import { adminErrorMessage, evidenceLabels, itemKindLabels, sectionLabels, statusLabels } from "./book-context-ui";
import { BuilderRunProgress } from "./builder-run-progress";
import { useBookContextPackQuery, usePackLifecycleMutation, useProposalMutation, useRegenerateBookContextMutation, useRetryBuilderRunMutation, useUpdateBookContextDraftMutation } from "./book-context-admin-query";

type Draft = AdminBookContextPackSnapshot["draft"];
type Section = Draft["sections"][number];
type Item = Section["items"][number];

function builderRunIsActive(run: AdminBookContextPackSnapshot["pack"]["builderRun"] | undefined) {
  return run !== null && run !== undefined &&
    (run.status === "PENDING" || run.status === "RUNNING" || run.status === "RETRYING");
}

function isRevisionConflict(error: unknown) {
  return error instanceof HttpClientError && error.code === "BOOK_BUILDER_REVISION_CONFLICT";
}

function prepareDraftForSave(draft: Draft): Readonly<{ draft: Draft; hasIncompleteItems: boolean }> {
  const linkedItemIds = new Set(draft.itemLinks.flatMap((link) => [link.fromItemId, link.toItemId]));
  draft.itemSources.forEach((evidence) => linkedItemIds.add(evidence.itemId));
  const emptyItemIds = new Set(
    draft.sections.flatMap((section) => section.items)
      .filter((item) =>
        item.title.trim() === "" &&
        item.content.trim() === "" &&
        (item.bookLocator?.trim() ?? "") === "" &&
        !linkedItemIds.has(item.itemId))
      .map((item) => item.itemId),
  );
  const cleaned = emptyItemIds.size === 0
    ? draft
    : {
        ...draft,
        sections: draft.sections.map((section) => ({
          ...section,
          items: section.items
            .filter((item) => !emptyItemIds.has(item.itemId))
            .map((item, displayOrder) => ({ ...item, displayOrder })),
        })),
        itemLinks: draft.itemLinks.filter((link) =>
          !emptyItemIds.has(link.fromItemId) && !emptyItemIds.has(link.toItemId)),
        itemSources: draft.itemSources.filter((evidence) => !emptyItemIds.has(evidence.itemId)),
      };

  return {
    draft: cleaned,
    hasIncompleteItems: cleaned.sections.some((section) =>
      section.items.some((item) => item.title.trim() === "" || item.content.trim() === "")),
  };
}

function codeLabel(code: string) {
  return ({
    BOOK_IDENTITY_INCOMPLETE: "책 정보 수정 필요 — 출판사와 출간 연도를 확인해 주세요.",
    SECTION_SET_INVALID: "내용 수정 필요 — 필수 구성 일부가 빠져 있습니다.",
    PACK_EMPTY: "내용 수정 필요 — 최소 한 개의 항목이 필요합니다.",
    FACT_SOURCE_MISSING: "근거 부족 — 사실로 작성한 내용의 출처를 연결해 주세요.",
    FACT_LOW_TIER_ONLY: "근거 부족 — 신뢰할 수 있는 출처를 추가로 확인해 주세요.",
    AUTHOR_STATEMENT_SOURCE_MISSING: "근거 부족 — 작가의 직접 발언을 확인할 출처가 필요합니다.",
    SECTION_COVERAGE_INCOMPLETE: "검수 필요 — 확인할 자료가 부족한 부분이 있습니다.",
    LIMITED_OR_INSUFFICIENT_EVIDENCE: "근거 부족 — 확인된 자료가 제한적인 내용이 있습니다.",
    SOURCE_CONFLICT_RETAINED: "검수 필요 — 출처마다 내용이 다른 부분이 있습니다.",
    SOURCE_UNAVAILABLE: "검수 필요 — 현재 확인할 수 없는 출처가 있습니다.",
  } as Record<string, string>)[code] ?? code;
}

function NativeSelect({ value, onChange, disabled, children, label }: Readonly<{ value: string; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode; label: string }>) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-10 rounded-md border border-border-strong bg-surface-elevated px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{children}</select>;
}

function MetadataEditor({ draft, disabled, onChange }: Readonly<{ draft: Draft; disabled: boolean; onChange: (draft: Draft) => void }>) {
  const updateBook = (field: keyof Draft["book"], value: string) => onChange({ ...draft, book: { ...draft.book, [field]: value.trim() === "" ? null : value } });
  return (
    <div className="grid gap-5">
      <label className="grid gap-2 text-label">짧은 소개<Textarea disabled={disabled} value={draft.shortDescription} maxLength={1000} onChange={(event) => onChange({ ...draft, shortDescription: event.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-label">책 제목<Input disabled={disabled} value={draft.book.title} onChange={(event) => onChange({ ...draft, book: { ...draft.book, title: event.target.value } })} /></label>
        <label className="grid gap-2 text-label">저자<Input disabled={disabled} value={draft.book.author} onChange={(event) => onChange({ ...draft, book: { ...draft.book, author: event.target.value } })} /></label>
        {(["publisher", "genre", "edition", "translator", "isbn"] as const).map((field) => <label key={field} className="grid gap-2 text-label">{{ publisher: "출판사", genre: "장르", edition: "판본", translator: "번역자", isbn: "ISBN" }[field]}<Input disabled={disabled} value={draft.book[field] ?? ""} onChange={(event) => updateBook(field, event.target.value)} /></label>)}
        <label className="grid gap-2 text-label">출간 연도<Input disabled={disabled} inputMode="numeric" value={draft.book.publicationYear ?? ""} onChange={(event) => onChange({ ...draft, book: { ...draft.book, publicationYear: event.target.value ? Number(event.target.value) : null } })} /></label>
      </div>
      <label className="grid gap-2 text-label">판본 확인 메모<Textarea disabled={disabled} value={draft.book.identityNote ?? ""} maxLength={1000} onChange={(event) => updateBook("identityNote", event.target.value)} /></label>
    </div>
  );
}

function SectionEditor({ draft, section, disabled, canRegenerate, onChange, onAdd, onRegenerateItem }: Readonly<{ draft: Draft; section: Section; disabled: boolean; canRegenerate: boolean; onChange: (draft: Draft) => void; onAdd: (draft: Draft) => void; onRegenerateItem: (itemId: string) => void }>) {
  const replaceSection = (next: Section) => onChange({ ...draft, sections: draft.sections.map((candidate) => candidate.sectionId === section.sectionId ? next : candidate) });
  const updateItem = (itemId: string, next: Item) => replaceSection({ ...section, items: section.items.map((item) => item.itemId === itemId ? next : item) });
  const removeItem = (itemId: string) => replaceSection({ ...section, items: section.items.filter((item) => item.itemId !== itemId).map((item, displayOrder) => ({ ...item, displayOrder })) });
  const addItem = () => onAdd({ ...draft, sections: draft.sections.map((candidate) => candidate.sectionId === section.sectionId ? { ...section, items: [...section.items, { itemId: crypto.randomUUID(), displayOrder: section.items.length, kind: "INTERPRETATION", title: "", content: "", bookLocator: null, evidenceState: "INSUFFICIENT", reviewStatus: "UNREVIEWED" }] } : candidate) });

  return (
    <div className="grid gap-5">
      {!disabled && <div className="flex justify-end"><Button size="sm" onClick={addItem}><Plus aria-hidden="true" />항목 추가</Button></div>}
      {section.items.length === 0 ? <div className="rounded-lg border border-dashed border-border-strong p-10 text-center"><p className="text-body m-0 text-muted-foreground">아직 확인된 항목이 없습니다.</p></div> : section.items.map((item) => {
        const evidenceCount = draft.itemSources.filter((evidence) => evidence.itemId === item.itemId).length;
        const incomplete = item.title.trim() === "" || item.content.trim() === "";
        return (
          <article key={item.itemId} className="grid gap-4 rounded-xl border border-border bg-surface-elevated p-5">
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect label="항목 종류" disabled={disabled} value={item.kind} onChange={(value) => updateItem(item.itemId, { ...item, kind: value as Item["kind"] })}>{Object.entries(itemKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect>
              <NativeSelect label="근거 상태" disabled={disabled} value={item.evidenceState} onChange={(value) => updateItem(item.itemId, { ...item, evidenceState: value as Item["evidenceState"] })}>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect>
              <Badge variant={evidenceCount ? "accent" : "outline"}>출처 {evidenceCount}</Badge>
              {!disabled && <div className="ml-auto flex gap-1">{canRegenerate && <Tooltip><TooltipTrigger asChild><IconButton label={`${item.title} 다시 생성`} variant="ghost" onClick={() => onRegenerateItem(item.itemId)}><RefreshCw aria-hidden="true" /></IconButton></TooltipTrigger><TooltipContent>이 항목 다시 생성</TooltipContent></Tooltip>}<Tooltip><TooltipTrigger asChild><IconButton label={`${item.title} 삭제`} variant="ghost" onClick={() => removeItem(item.itemId)}><Trash2 aria-hidden="true" /></IconButton></TooltipTrigger><TooltipContent>삭제</TooltipContent></Tooltip></div>}
            </div>
            <label className="grid gap-2 text-label">제목 <span className="text-destructive">필수</span><Input required disabled={disabled} value={item.title} maxLength={300} placeholder="항목 제목" onChange={(event) => updateItem(item.itemId, { ...item, title: event.target.value })} /></label>
            <label className="grid gap-2 text-label">내용 <span className="text-destructive">필수</span><Textarea required disabled={disabled} value={item.content} maxLength={3000} placeholder="검수할 내용을 입력해 주세요." onChange={(event) => updateItem(item.itemId, { ...item, content: event.target.value })} /></label>
            {!disabled && incomplete && <p className="text-caption m-0 text-destructive">제목과 내용을 모두 입력해야 저장됩니다. 둘 다 비어 있으면 저장에서 제외됩니다.</p>}
            <label className="grid gap-2 text-label">책 위치<Input disabled={disabled} value={item.bookLocator ?? ""} maxLength={500} placeholder="예: 2부 3장" onChange={(event) => updateItem(item.itemId, { ...item, bookLocator: event.target.value || null })} /></label>
            {draft.sources.length > 0 && <details className="rounded-lg bg-surface-muted p-4"><summary className="cursor-pointer text-label">연결된 출처 {evidenceCount}개</summary><div className="mt-4 grid gap-3">{draft.sources.map((source) => {
              const evidence = draft.itemSources.find((entry) => entry.itemId === item.itemId && entry.sourceId === source.sourceId);
              return <div key={source.sourceId} className="grid gap-3 rounded-md border border-border bg-surface-elevated p-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="flex min-w-0 items-start gap-3 text-body"><Checkbox disabled={disabled} checked={Boolean(evidence)} onCheckedChange={(checked) => onChange({ ...draft, itemSources: checked ? [...draft.itemSources, { itemId: item.itemId, sourceId: source.sourceId, relation: "SUPPORTS", evidenceLocator: source.bibliographicLocator ?? "관리자 확인", crossValidationGroup: null }] : draft.itemSources.filter((entry) => !(entry.itemId === item.itemId && entry.sourceId === source.sourceId)) })} /><span className="min-w-0"><strong className="block truncate">{source.title}</strong><span className="text-caption text-muted-foreground">{source.sourceType}</span></span></label>{evidence && <NativeSelect label={`${source.title} 근거 관계`} disabled={disabled} value={evidence.relation} onChange={(value) => onChange({ ...draft, itemSources: draft.itemSources.map((entry) => entry === evidence ? { ...entry, relation: value as typeof entry.relation } : entry) })}><option value="SUPPORTS">뒷받침</option><option value="CONTRADICTS">반박</option><option value="CONTEXT_ONLY">맥락</option></NativeSelect>}</div>;
            })}</div></details>}
          </article>
        );
      })}
    </div>
  );
}

function SourcesPanel({ draft, disabled, onChange }: Readonly<{ draft: Draft; disabled: boolean; onChange: (draft: Draft) => void }>) {
  const replaceSource = (sourceId: string, patch: Partial<Draft["sources"][number]>) => onChange({ ...draft, sources: draft.sources.map((source) => source.sourceId === sourceId ? { ...source, ...patch } : source) });
  const removeSource = (sourceId: string) => onChange({ ...draft, sources: draft.sources.filter((source) => source.sourceId !== sourceId), itemSources: draft.itemSources.filter((evidence) => evidence.sourceId !== sourceId) });
  const addSource = () => onChange({ ...draft, sources: [...draft.sources, { sourceId: crypto.randomUUID(), tier: "C", sourceType: "웹 자료", title: "새 출처", authorOrPublisher: null, url: null, bibliographicLocator: null, publishedAt: null, researchedAt: new Date().toISOString(), unavailableAt: null, usageNote: null, rightsNote: null }] });
  return <section id="pack-sources" className="rounded-xl border border-border bg-surface-elevated p-5 sm:p-7" aria-labelledby="sources-title"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><h2 id="sources-title" className="text-section-title m-0">출처</h2><Badge>{draft.sources.length}</Badge></div>{!disabled && <Button size="sm" onClick={addSource}><Plus aria-hidden="true" />출처 추가</Button>}</div>{draft.sources.length === 0 ? <p className="text-body text-muted-foreground">확인된 출처가 없습니다.</p> : <div className="grid gap-3">{draft.sources.map((source) => <details key={source.sourceId} className="rounded-lg border border-border p-4"><summary className="cursor-pointer list-none"><div className="inline-flex max-w-[calc(100%-2rem)] items-center gap-2 align-middle"><Badge variant="outline">{source.sourceType}</Badge>{source.unavailableAt && <Badge variant="destructive">출처 확인 불가</Badge>}<strong className="truncate text-[14px]">{source.title}</strong></div></summary><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-label">자료 유형<Input disabled={disabled} value={source.sourceType} onChange={(event) => replaceSource(source.sourceId, { sourceType: event.target.value })} /></label><label className="grid gap-2 text-label sm:col-span-2">제목<Input disabled={disabled} value={source.title} onChange={(event) => replaceSource(source.sourceId, { title: event.target.value })} /></label><label className="grid gap-2 text-label">저자·발행처<Input disabled={disabled} value={source.authorOrPublisher ?? ""} onChange={(event) => replaceSource(source.sourceId, { authorOrPublisher: event.target.value || null })} /></label><label className="grid gap-2 text-label">위치<Input disabled={disabled} value={source.bibliographicLocator ?? ""} onChange={(event) => replaceSource(source.sourceId, { bibliographicLocator: event.target.value || null })} /></label><label className="grid gap-2 text-label sm:col-span-2">URL<Input disabled={disabled} type="url" value={source.url ?? ""} onChange={(event) => replaceSource(source.sourceId, { url: event.target.value || null })} /></label><label className="grid gap-2 text-label sm:col-span-2">활용 메모<Textarea disabled={disabled} value={source.usageNote ?? ""} onChange={(event) => replaceSource(source.sourceId, { usageNote: event.target.value || null })} /></label><label className="grid gap-2 text-label sm:col-span-2">권리 메모<Textarea disabled={disabled} value={source.rightsNote ?? ""} onChange={(event) => replaceSource(source.sourceId, { rightsNote: event.target.value || null })} /></label><label className="flex items-center gap-3 text-body sm:col-span-2"><Checkbox disabled={disabled} checked={Boolean(source.unavailableAt)} onCheckedChange={(checked) => replaceSource(source.sourceId, { unavailableAt: checked ? new Date().toISOString() : null })} />현재 확인할 수 없는 출처</label></div>{!disabled && <div className="mt-4 flex justify-end"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSource(source.sourceId)}><Trash2 aria-hidden="true" />출처 삭제</Button></div>}</details>)}</div>}</section>;
}

function ProposalPanel({ snapshot, pending, onAction }: Readonly<{ snapshot: AdminBookContextPackSnapshot; pending: boolean; onAction: (action: "apply" | "discard") => void }>) {
  const proposal = snapshot.pendingProposal;
  if (!proposal) return null;
  return <section className="rounded-xl border border-accent/30 bg-accent-subtle p-5" aria-labelledby="proposal-title"><h2 id="proposal-title" className="text-section-title m-0">변경 제안 검토</h2><p className="text-body text-muted-foreground">Builder 제안은 현재 초안을 자동으로 덮어쓰지 않습니다. 차이를 확인한 뒤 적용하세요.</p><div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-border bg-surface-elevated p-4"><p className="text-label mt-0">현재 초안</p><p className="text-body mb-1">{snapshot.draft.shortDescription}</p><p className="text-caption mb-0 text-muted-foreground">항목 {snapshot.draft.sections.reduce((sum, section) => sum + section.items.length, 0)}개 · 출처 {snapshot.draft.sources.length}개</p></div><div className="rounded-lg border border-topic-border bg-surface-elevated p-4"><p className="text-label mt-0">Builder 제안</p><p className="text-body mb-1">{proposal.draft.shortDescription}</p><p className="text-caption mb-0 text-muted-foreground">항목 {proposal.draft.sections.reduce((sum, section) => sum + section.items.length, 0)}개 · 출처 {proposal.draft.sources.length}개</p></div></div><div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface-elevated"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border px-4 py-2 text-caption font-semibold text-muted-foreground"><span>섹션</span><span>현재</span><span>제안</span></div>{snapshot.draft.sections.map((section) => { const proposed = proposal.draft.sections.find((candidate) => candidate.code === section.code); const changed = JSON.stringify(section) !== JSON.stringify(proposed); return <div key={section.code} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-4 py-2 text-caption ${changed ? "bg-topic-background text-foreground" : "text-muted-foreground"}`}><span>{sectionLabels[section.code]}{changed && <span className="ml-1 text-accent-strong">변경</span>}</span><span>{section.items.length}</span><span>{proposed?.items.length ?? 0}</span></div>; })}</div><div className="mt-4 flex justify-end gap-2"><Button onClick={() => onAction("discard")} disabled={pending}>버리기</Button><Button variant="primary" onClick={() => onAction("apply")} disabled={pending}>제안 적용</Button></div></section>;
}

function LifecycleDialogs({ snapshot, pending, error, onLifecycle }: Readonly<{ snapshot: AdminBookContextPackSnapshot; pending: boolean; error?: string; onLifecycle: (kind: "review" | "draft" | "publish" | "retire", extra?: string[] | string) => void }>) {
  const [dialog, setDialog] = React.useState<"review" | "publish" | "retire" | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { pack, validation } = snapshot;
  if (pack.status === "DRAFT") return <div className="flex justify-end"><Button variant="primary" onClick={() => setDialog("review")} disabled={pending || pack.builderRun?.status !== "SUCCEEDED" || validation.hardBlockers.length > 0}>전체 검수 완료</Button><Dialog open={dialog === "review"} onOpenChange={(open) => { setDialog(open ? "review" : null); if (!open) setWarningsAcknowledged(false); }}><DialogContent><DialogHeader><DialogTitle>Pack 전체 검수를 완료할까요?</DialogTitle><DialogDescription>전체 내용을 확인하고 필요한 수정과 삭제를 마쳤다면 검수를 완료해 주세요. 완료 후에는 읽기 전용이 되며, 게시 전에 다시 수정할 수 있습니다.</DialogDescription></DialogHeader>{validation.warnings.length > 0 && <div className="grid gap-3"><p className="text-label m-0">확인 필요 항목</p><ul className="text-body m-0 pl-5">{validation.warnings.map((warning) => <li key={warning}>{codeLabel(warning)}</li>)}</ul><label className="flex items-start gap-3 rounded-lg bg-surface-muted p-4 text-body"><Checkbox checked={warningsAcknowledged} onCheckedChange={(checked) => setWarningsAcknowledged(Boolean(checked))} /><span>표시된 확인 필요 항목을 모두 확인했습니다.</span></label></div>}{error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}<DialogFooter><Button variant="primary" onClick={() => onLifecycle("review", validation.warnings)} disabled={pending || (validation.warnings.length > 0 && !warningsAcknowledged)}>전체 검수 완료</Button></DialogFooter></DialogContent></Dialog></div>;
  if (pack.status === "REVIEW") return <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => onLifecycle("draft")} disabled={pending}>다시 수정하기</Button><Button variant="primary" onClick={() => setDialog("publish")} disabled={pending}>게시하기</Button><Dialog open={dialog === "publish"} onOpenChange={(open) => setDialog(open ? "publish" : null)}><DialogContent><DialogHeader><DialogTitle>검수한 Pack을 게시할까요?</DialogTitle><DialogDescription>새 토론은 이 버전을 사용합니다. 이미 만들어진 토론은 기존에 고정된 버전을 계속 사용합니다.</DialogDescription></DialogHeader>{error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}<DialogFooter><Button variant="primary" onClick={() => onLifecycle("publish")} disabled={pending}>게시</Button></DialogFooter></DialogContent></Dialog></div>;
  if (pack.status === "PUBLISHED") return <div className="flex justify-end"><Button variant="destructive" onClick={() => setDialog("retire")}>게시 중단</Button><Dialog open={dialog === "retire"} onOpenChange={(open) => setDialog(open ? "retire" : null)}><DialogContent><DialogHeader><DialogTitle>이 Pack의 게시를 중단할까요?</DialogTitle><DialogDescription>새 토론의 책 목록에서는 제외됩니다. 이미 이 버전을 사용하는 토론에는 영향을 주지 않습니다.</DialogDescription></DialogHeader><label className="grid gap-2 text-label">중단 사유<Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}<DialogFooter><Button variant="destructive" onClick={() => onLifecycle("retire", reason)} disabled={pending || !reason.trim()}>게시 중단</Button></DialogFooter></DialogContent></Dialog></div>;
  return null;
}

export function BookContextPackPage() {
  const { packVersionId = "" } = useParams();
  const query = useBookContextPackQuery(packVersionId);
  const save = useUpdateBookContextDraftMutation(packVersionId);
  const lifecycle = usePackLifecycleMutation(packVersionId);
  const retry = useRetryBuilderRunMutation(packVersionId);
  const regenerate = useRegenerateBookContextMutation(packVersionId);
  const proposal = useProposalMutation(packVersionId);
  const [draft, setDraft] = React.useState<Draft>();
  const [revision, setRevision] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const [saveConflict, setSaveConflict] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "incomplete" | "error">("idle");
  const [error, setError] = React.useState<string>();
  const draftRef = React.useRef<Draft | undefined>(undefined);

  React.useEffect(() => { draftRef.current = draft; }, [draft]);
  React.useEffect(() => {
    if (!query.data || dirty) return;
    setDraft(query.data.draft);
    setRevision(query.data.pack.revision);
  }, [query.data, dirty]);

  React.useEffect(() => {
    if (!dirty || !draft || query.data?.pack.status !== "DRAFT" ||
      builderRunIsActive(query.data?.pack.builderRun) || save.isPending || saveConflict) return;
    const timer = window.setTimeout(async () => {
      const draftAtSave = draft;
      const prepared = prepareDraftForSave(draftAtSave);
      if (prepared.hasIncompleteItems) {
        setSaveState("incomplete");
        return;
      }
      const savingDraft = prepared.draft;
      setSaveState("saving");
      setError(undefined);
      try {
        const response = await save.mutateAsync({ commandId: crypto.randomUUID(), expectedRevision: revision, draft: savingDraft });
        setRevision(response.revision);
        if (draftRef.current === draftAtSave) {
          setDraft(savingDraft);
          draftRef.current = savingDraft;
          setDirty(false);
        }
        setSaveState("saved");
      } catch (caught) {
        setSaveState("error");
        setError(adminErrorMessage(caught));
        if (isRevisionConflict(caught)) {
          setSaveConflict(true);
          void query.refetch();
        }
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, query.data?.pack.builderRun, query.data?.pack.status, revision, save.isPending, saveConflict]);

  if (!packVersionId) return <Navigate to="/admin/book-context" replace />;
  if (query.isError) return <main className="mx-auto max-w-3xl px-5 py-16"><p role="alert" className="text-body text-destructive">{adminErrorMessage(query.error)}</p><Button onClick={() => void query.refetch()}>다시 불러오기</Button></main>;
  if (query.isPending || !query.data || !draft) return <main className="grid min-h-[60dvh] place-items-center px-5"><p role="status" className="text-body text-muted-foreground">Pack을 불러오고 있습니다.</p></main>;
  const snapshot = query.data;
  const run = snapshot.pack.builderRun;
  const builderActive = builderRunIsActive(run);
  const disabled = snapshot.pack.status !== "DRAFT" || builderActive;
  const showReviewGuidance = run?.status === "SUCCEEDED" &&
    (snapshot.validation.hardBlockers.length > 0 || snapshot.validation.warnings.length > 0);
  const updateDraft = (next: Draft) => { setDraft(next); setDirty(true); setSaveState("idle"); };
  const addDraftItem = (next: Draft) => { setDraft(next); setSaveState("idle"); };
  const regenerateItem = (itemId: string) => void runAction(() => regenerate.mutateAsync({ commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision, scope: "ITEM", targetItemId: itemId }));

  async function reloadAfterConflict() {
    setDirty(false);
    setSaveConflict(false);
    setSaveState("idle");
    setError(undefined);
    await query.refetch();
  }

  async function runAction(operation: () => Promise<unknown>) {
    setError(undefined);
    try {
      await operation();
    } catch (caught) {
      setError(adminErrorMessage(caught));
      if (isRevisionConflict(caught) && !dirty) await query.refetch();
    }
  }
  const lifecycleAction = (kind: "review" | "draft" | "publish" | "retire", extra?: string[] | string) => void runAction(() => lifecycle.mutateAsync(kind === "review" ? { kind, request: { commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision, acknowledgedWarnings: extra as string[] } } : kind === "retire" ? { kind, request: { commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision, reason: extra as string } } : { kind, request: { commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision } }));

  return (
    <main className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/admin/book-context" className="mb-6 inline-flex items-center gap-2 text-caption text-muted-foreground no-underline hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Pack 목록</Link>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-page-title m-0">{snapshot.pack.title}</h1><Badge>v{snapshot.pack.version}</Badge><Badge variant={snapshot.pack.status === "PUBLISHED" ? "accent" : "neutral"}>{statusLabels[snapshot.pack.status]}</Badge></div><p className="text-body mb-0 mt-2 text-muted-foreground">{snapshot.pack.author}</p></div>
        <div className="flex items-center gap-2" aria-live="polite">{saveState === "saving" && <span className="text-caption text-muted-foreground"><RefreshCw aria-hidden="true" className="mr-1 inline size-3 animate-spin" />저장 중</span>}{saveState === "saved" && <span className="text-caption text-accent-strong"><Check aria-hidden="true" className="mr-1 inline size-3" />저장됨</span>}{saveState === "incomplete" && <span className="text-caption text-destructive"><CircleAlert aria-hidden="true" className="mr-1 inline size-3" />필수 항목 입력 필요</span>}{saveState === "error" && <span className="text-caption text-destructive"><CircleAlert aria-hidden="true" className="mr-1 inline size-3" />저장 실패</span>}</div>
      </header>

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-body text-destructive"><CircleAlert aria-hidden="true" className="size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>{saveConflict && <Button size="sm" onClick={() => void reloadAfterConflict()}>최신 상태 불러오기</Button>}</div>}
      {run && run.status !== "SUCCEEDED" && <div className="mb-6"><BuilderRunProgress run={run} retrying={retry.isPending} onRetry={() => void runAction(() => retry.mutateAsync({ runId: run.runId, request: { commandId: crypto.randomUUID() } }))} /></div>}
      <div className="mb-6"><ProposalPanel snapshot={snapshot} pending={proposal.isPending} onAction={(action) => void runAction(() => proposal.mutateAsync({ proposalId: snapshot.pendingProposal!.proposalId, action, request: { commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision } }))} /></div>

      {showReviewGuidance && <section className="mb-6 rounded-xl border border-border bg-surface-muted p-5"><h2 className="text-card-title m-0">검수 안내</h2>{snapshot.validation.hardBlockers.length > 0 && <div className="mt-4"><p className="text-label text-destructive">수정 필요 {snapshot.validation.hardBlockers.length}건</p><ul className="text-body pl-5">{snapshot.validation.hardBlockers.map((blocker) => <li key={blocker}>{codeLabel(blocker)}</li>)}</ul></div>}{snapshot.validation.warnings.length > 0 && <div className="mt-4"><p className="text-label">확인 필요 {snapshot.validation.warnings.length}건</p><ul className="text-body pl-5">{snapshot.validation.warnings.map((warning) => <li key={warning}>{codeLabel(warning)}</li>)}</ul></div>}</section>}

      <div className="grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-[calc(var(--layout-header-height)+1.5rem)]">
          <nav aria-label="Pack 섹션" className="grid gap-1 rounded-xl border border-border bg-surface-elevated p-2">{draft.sections.map((section) => <a key={section.code} href={`#pack-section-${section.code}`} className="rounded-md px-3 py-2.5 text-[13px] text-muted-foreground no-underline hover:bg-surface-muted hover:text-foreground">{sectionLabels[section.code]}</a>)}<a href="#pack-sources" className="rounded-md px-3 py-2.5 text-[13px] text-muted-foreground no-underline hover:bg-surface-muted hover:text-foreground">출처</a></nav>
        </aside>
        <div className="grid min-w-0 gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-caption m-0 text-muted-foreground">{builderActive ? "Builder 생성 중에는 revision 충돌을 막기 위해 편집할 수 없습니다." : disabled ? "전체 검수가 완료되어 읽기 전용입니다." : "전체 내용을 이어서 확인하세요. 변경 내용은 자동으로 저장됩니다."}</p>{!disabled && run?.status === "SUCCEEDED" && <Button size="sm" onClick={() => void runAction(() => regenerate.mutateAsync({ commandId: crypto.randomUUID(), expectedRevision: snapshot.pack.revision, scope: "FULL", targetItemId: null }))} disabled={regenerate.isPending || dirty || save.isPending || Boolean(snapshot.pendingProposal)}><RefreshCw aria-hidden="true" />전체 다시 생성</Button>}</div>
          {draft.sections.map((section) => <section id={`pack-section-${section.code}`} key={section.sectionId} className="scroll-mt-24 rounded-xl border border-border bg-surface-elevated p-5 sm:p-7" aria-labelledby={`section-title-${section.code}`}><h2 id={`section-title-${section.code}`} className="text-section-title mb-6 mt-0">{sectionLabels[section.code]}</h2>{section.code === "METADATA" ? <div className="grid gap-8"><MetadataEditor draft={draft} disabled={disabled} onChange={updateDraft} /><div className="border-t border-border pt-7"><h3 className="text-card-title mt-0">책 정보 항목</h3><SectionEditor draft={draft} section={section} disabled={disabled} canRegenerate={run?.status === "SUCCEEDED" && snapshot.pendingProposal === null} onChange={updateDraft} onAdd={addDraftItem} onRegenerateItem={regenerateItem} /></div></div> : <SectionEditor draft={draft} section={section} disabled={disabled} canRegenerate={run?.status === "SUCCEEDED" && snapshot.pendingProposal === null} onChange={updateDraft} onAdd={addDraftItem} onRegenerateItem={regenerateItem} />}</section>)}
          <SourcesPanel draft={draft} disabled={disabled} onChange={updateDraft} />
        </div>
      </div>
      <div className="mt-7 border-t border-border pt-6"><LifecycleDialogs snapshot={snapshot} pending={lifecycle.isPending || builderActive || dirty || save.isPending || saveConflict} error={error} onLifecycle={lifecycleAction} /></div>
    </main>
  );
}
