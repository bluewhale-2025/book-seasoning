import * as React from "react";
import { ArrowRight, BookOpenCheck, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { adminErrorMessage, formatAdminDate, runLabel, statusLabels } from "./book-context-ui";
import { useBookContextPackListQuery, useCreateBookContextPackMutation } from "./book-context-admin-query";

export function BookContextPackListPage() {
  const navigate = useNavigate();
  const list = useBookContextPackListQuery();
  const create = useCreateBookContextPackMutation();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [error, setError] = React.useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !author.trim()) return;
    setError(undefined);
    try {
      const result = await create.mutateAsync({ commandId: crypto.randomUUID(), title, author });
      setOpen(false);
      navigate(`/admin/book-context/${result.packVersionId}`);
    } catch (caught) {
      setError(adminErrorMessage(caught));
    }
  }

  return (
    <main className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 flex items-end justify-between gap-5">
        <div>
          <p className="text-label mb-2 text-accent-strong">ADMIN</p>
          <h1 className="text-page-title m-0">Book Context</h1>
          <p className="text-body mb-0 mt-2 max-w-2xl text-muted-foreground">토론에 사용할 책의 근거와 쟁점을 검수하고 발행합니다.</p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(undefined); }}>
          <DialogTrigger asChild><Button variant="primary"><Plus aria-hidden="true" />새 Pack</Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={submit} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>새 Pack 만들기</DialogTitle>
                <DialogDescription>책 제목과 저자만 입력하면 Builder가 7개 섹션의 초안을 준비합니다.</DialogDescription>
              </DialogHeader>
              <label className="grid gap-2 text-label">책 제목<Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required maxLength={300} /></label>
              <label className="grid gap-2 text-label">저자<Input value={author} onChange={(event) => setAuthor(event.target.value)} required maxLength={200} /></label>
              {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
              <DialogFooter><Button type="submit" variant="primary" disabled={create.isPending || !title.trim() || !author.trim()}>만들기</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {list.isPending && <div className="rounded-xl border border-border p-8 text-center text-body text-muted-foreground" role="status">Pack을 불러오고 있습니다.</div>}
      {list.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p role="alert" className="text-body m-0 text-destructive">{adminErrorMessage(list.error)}</p><Button className="mt-4" onClick={() => void list.refetch()}>다시 불러오기</Button></div>}
      {list.data?.length === 0 && (
        <Card className="grid place-items-center gap-3 py-16 text-center">
          <BookOpenCheck aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="text-section-title m-0">아직 Pack이 없습니다</h2>
          <p className="text-body m-0 text-muted-foreground">첫 책을 추가해 Builder를 시작해 보세요.</p>
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <div className="grid gap-3">
          {list.data.map((pack) => {
            const activeRun = pack.builderRun && pack.builderRun.status !== "SUCCEEDED";
            return (
              <Link key={pack.packVersionId} to={`/admin/book-context/${pack.packVersionId}`} className="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border bg-surface-elevated p-5 text-foreground no-underline transition-colors hover:border-border-strong hover:bg-surface-muted sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-card-title m-0 truncate">{pack.title}</h2><Badge>v{pack.version}</Badge><Badge variant={pack.status === "PUBLISHED" ? "accent" : pack.status === "RETIRED" ? "outline" : "neutral"}>{statusLabels[pack.status]}</Badge></div>
                  <p className="text-body m-0 mt-1 truncate text-muted-foreground">{pack.author}</p>
                </div>
                <div className="hidden text-right sm:block">
                  {activeRun && <p className={pack.builderRun?.status === "FAILED" ? "text-caption m-0 text-destructive" : "text-caption m-0 text-accent-strong"}>{runLabel(pack.builderRun!.status)} · {pack.builderRun!.completedStageCount}/7</p>}
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
