import * as React from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Plus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import type { AdminBookSearchResult } from "@bookseasoning/contracts/admin";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { adminErrorMessage, formatAdminDate, runLabel, statusLabels } from "./book-context-ui";
import { useAdminBookSearchQuery, useBookContextPackListQuery, useCreateBookContextPackMutation } from "./book-context-admin-query";

function BookResult({ book, selected, onSelect }: Readonly<{
  book: AdminBookSearchResult;
  selected: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-lg border p-3 text-left ${selected ? "border-accent bg-accent-subtle" : "border-border bg-surface-elevated hover:border-border-strong"}`}
    >
      {book.thumbnailUrl ? (
        <img src={book.thumbnailUrl} alt="" className="h-16 w-12 rounded object-cover" />
      ) : (
        <span className="grid h-16 w-12 place-items-center rounded bg-surface-muted"><BookOpenCheck aria-hidden="true" className="size-5 text-muted-foreground" /></span>
      )}
      <span className="min-w-0">
        <strong className="block truncate text-[14px] text-foreground">{book.title}</strong>
        <span className="text-caption mt-1 block text-muted-foreground">{book.authors.join(", ")}</span>
        <span className="text-caption mt-1 block text-muted-foreground">
          {[book.publisher, book.publishedDate?.slice(0, 4), book.translators.length > 0 ? `번역 ${book.translators.join(", ")}` : null].filter(Boolean).join(" · ") || "출판 정보 없음"}
        </span>
        <span className="text-caption mt-1 block text-muted-foreground">ISBN {book.isbn13 ?? book.isbn10 ?? "미확인"}</span>
      </span>
    </button>
  );
}

function NewPackDialog({ open, onOpenChange }: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const navigate = useNavigate();
  const create = useCreateBookContextPackMutation();
  const [queryInput, setQueryInput] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [selected, setSelected] = React.useState<AdminBookSearchResult>();
  const [error, setError] = React.useState<string>();
  const search = useAdminBookSearchQuery(submittedQuery, 1, open);

  function reset() {
    setQueryInput("");
    setSubmittedQuery("");
    setSelected(undefined);
    setError(undefined);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = queryInput.trim();
    if (!query) return;
    setError(undefined);
    setSelected(undefined);
    if (query === submittedQuery) void search.refetch();
    else setSubmittedQuery(query);
  }

  async function createPack() {
    if (!selected) return;
    setError(undefined);
    try {
      const result = await create.mutateAsync({
        commandId: crypto.randomUUID(),
        selectionProof: selected.selectionProof,
      });
      handleOpenChange(false);
      navigate(`/admin/book-context/${result.packVersionId}`);
    } catch (caught) {
      setError(adminErrorMessage(caught));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button variant="primary"><Plus aria-hidden="true" />새 Pack</Button></DialogTrigger>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selected ? "선택한 책 확인" : "새 Pack 만들기"}</DialogTitle>
          <DialogDescription>{selected ? "표지와 판본 정보를 확인한 뒤 Pack 생성을 시작하세요." : "제목, 저자 또는 ISBN으로 정확한 책과 판본을 찾으세요."}</DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="grid gap-5">
            <Button variant="ghost" className="w-fit" onClick={() => setSelected(undefined)}><ArrowLeft aria-hidden="true" />검색 결과로 돌아가기</Button>
            <BookResult book={selected} selected onSelect={() => undefined} />
            {selected.description && <p className="text-body m-0 rounded-lg bg-surface-muted p-4 text-muted-foreground">{selected.description}</p>}
            <p className="text-caption m-0 text-muted-foreground">외부 도서 정보는 책과 판본을 식별하는 데 사용되며, Pack 내용은 Builder가 별도로 조사합니다.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <form onSubmit={submitSearch} className="flex gap-2">
              <label className="sr-only" htmlFor="admin-book-search">책 검색</label>
              <Input id="admin-book-search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} autoFocus placeholder="제목, 저자 또는 ISBN" maxLength={200} />
              <Button type="submit" disabled={!queryInput.trim() || search.isFetching}><Search aria-hidden="true" />검색</Button>
            </form>
            {search.isFetching && <p role="status" className="text-body m-0 py-8 text-center text-muted-foreground">책을 찾고 있습니다.</p>}
            {search.isError && <p role="alert" className="text-body m-0 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{adminErrorMessage(search.error)}</p>}
            {search.data?.results.length === 0 && <p className="text-body m-0 rounded-lg bg-surface-muted p-6 text-center text-muted-foreground">검색 결과가 없습니다. 다른 검색어나 ISBN을 입력해 주세요.</p>}
            {search.data && search.data.results.length > 0 && <div className="grid gap-2" aria-label="도서 검색 결과">{search.data.results.map((book) => <BookResult key={`${book.provider}:${book.externalBookId}`} book={book} selected={false} onSelect={() => setSelected(book)} />)}</div>}
          </div>
        )}

        {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
        {selected && <DialogFooter><Button variant="primary" onClick={() => void createPack()} disabled={create.isPending}>이 책으로 Pack 만들기</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function BookContextPackListPage() {
  const list = useBookContextPackListQuery();
  const [open, setOpen] = React.useState(false);

  return (
    <main className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 flex items-end justify-between gap-5">
        <div>
          <p className="text-label mb-2 text-accent-strong">ADMIN</p>
          <h1 className="text-page-title m-0">Book Context</h1>
          <p className="text-body mb-0 mt-2 max-w-2xl text-muted-foreground">토론에 사용할 책의 근거와 쟁점을 검수하고 발행합니다.</p>
        </div>
        <NewPackDialog open={open} onOpenChange={setOpen} />
      </header>

      {list.isPending && <div className="rounded-xl border border-border p-8 text-center text-body text-muted-foreground" role="status">Pack을 불러오고 있습니다.</div>}
      {list.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p role="alert" className="text-body m-0 text-destructive">{adminErrorMessage(list.error)}</p><Button className="mt-4" onClick={() => void list.refetch()}>다시 불러오기</Button></div>}
      {list.data?.length === 0 && (
        <Card className="grid place-items-center gap-3 py-16 text-center">
          <BookOpenCheck aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="text-section-title m-0">아직 Pack이 없습니다</h2>
          <p className="text-body m-0 text-muted-foreground">첫 책을 검색해 Builder를 시작해 보세요.</p>
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <div className="grid gap-3">
          {list.data.map((pack) => {
            const activeRun = pack.builderRun !== null && ["PENDING", "RUNNING", "RETRYING"].includes(pack.builderRun.status);
            const showRunStatus = pack.builderRun !== null && pack.builderRun.status !== "SUCCEEDED";
            return (
              <Link key={pack.packVersionId} to={`/admin/book-context/${pack.packVersionId}`} className="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border bg-surface-elevated p-5 text-foreground no-underline transition-colors hover:border-border-strong hover:bg-surface-muted sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-card-title m-0 truncate">{pack.title}</h2><Badge>v{pack.version}</Badge><Badge variant={pack.status === "PUBLISHED" ? "accent" : pack.status === "RETIRED" ? "outline" : "neutral"}>{activeRun ? "생성 중" : statusLabels[pack.status]}</Badge></div>
                  <p className="text-body m-0 mt-1 truncate text-muted-foreground">{pack.author}</p>
                </div>
                <div className="hidden text-right sm:block">
                  {showRunStatus && <p className={pack.builderRun?.status === "FAILED" ? "text-caption m-0 text-destructive" : "text-caption m-0 text-accent-strong"}>{runLabel(pack.builderRun!.status)} · {pack.builderRun!.completedStageCount}/7</p>}
                  <p className="text-caption m-0 text-muted-foreground">{formatAdminDate(pack.updatedAt)}</p>
                </div>
                <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
