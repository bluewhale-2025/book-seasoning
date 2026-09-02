import type { AdminBookContextPackSummary } from "@bookseasoning/contracts/admin";
import { Check, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";

import { IconButton } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";

const stages = [
  ["IDENTIFY_BOOK", "책 확인"],
  ["DISCOVER_SOURCES", "자료 탐색"],
  ["CAPTURE_SOURCE_METADATA", "출처 정리"],
  ["EXTRACT_CLAIMS", "내용 추출"],
  ["CROSS_VALIDATE", "교차 검증"],
  ["BUILD_SECTIONS", "섹션 구성"],
  ["VALIDATE_DRAFT", "초안 검사"],
] as const;

export function BuilderRunProgress({
  run,
  retrying,
  onRetry,
}: Readonly<{
  run: NonNullable<AdminBookContextPackSummary["builderRun"]>;
  retrying: boolean;
  onRetry: () => void;
}>) {
  const currentIndex = stages.findIndex(([code]) => code === run.stage);
  return (
    <section className="rounded-xl border border-topic-border bg-topic-background p-5" aria-labelledby="builder-progress-title">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="builder-progress-title" className="text-card-title m-0">Builder</h2>
          <p className="text-caption m-0 mt-1 text-muted-foreground">{run.completedStageCount}/7 단계 완료</p>
        </div>
        {run.status === "FAILED" && (
          <Tooltip>
            <TooltipTrigger asChild><IconButton label="실패한 단계 다시 시도" variant="ghost" onClick={onRetry} disabled={retrying}><RotateCcw aria-hidden="true" /></IconButton></TooltipTrigger>
            <TooltipContent>다시 시도</TooltipContent>
          </Tooltip>
        )}
      </div>
      <ol className="mt-5 grid gap-2 p-0 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map(([code, label], index) => {
          const done = index < run.completedStageCount || run.status === "SUCCEEDED";
          const current = index === currentIndex && !done;
          const failed = current && run.status === "FAILED";
          return (
            <li key={code} className="flex min-w-0 items-center gap-2 sm:flex-col sm:items-start">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-accent text-accent-foreground" : failed ? "bg-destructive text-destructive-foreground" : "border border-border-strong bg-surface-elevated text-muted-foreground"}`}>
                {done ? <Check aria-hidden="true" className="size-3.5" /> : failed ? <TriangleAlert aria-hidden="true" className="size-3.5" /> : current ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <span className="text-[11px]">{index + 1}</span>}
              </span>
              <span className="text-caption truncate text-muted-foreground">{label}</span>
            </li>
          );
        })}
      </ol>
      {run.status === "FAILED" && <p role="alert" className="text-caption mb-0 mt-4 text-destructive">이 단계가 완료되지 않았습니다. 다시 시도해 주세요.</p>}
    </section>
  );
}
