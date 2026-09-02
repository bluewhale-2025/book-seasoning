import * as React from "react";
import { Users } from "lucide-react";

import { cn } from "../../lib/utils";
import { BookIdentity } from "./book-identity";
import { SessionTimer } from "../discussion/session-timer";
import type { SessionPhase } from "@bookseasoning/contracts/public";

type BookContextHeaderProps = React.ComponentProps<"header"> & {
  title: string;
  author: string;
  coverSrc?: string;
  remainingSeconds: number;
  phase: SessionPhase;
  participantCount: number;
  compact?: boolean;
};

export function BookContextHeader({
  title,
  author,
  coverSrc,
  remainingSeconds,
  phase,
  participantCount,
  compact = false,
  className,
  ...props
}: BookContextHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-[var(--layout-book-context-height)] items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-5",
        compact && "min-h-14",
        className,
      )}
      {...props}
    >
      <BookIdentity
        title={title}
        author={author}
        coverSrc={coverSrc}
        compact={compact}
      />
      <div className="flex shrink-0 items-center gap-3 text-muted-foreground sm:gap-4">
        <SessionTimer remainingSeconds={remainingSeconds} phase={phase} />
        <span className="text-metadata inline-flex items-center gap-1.5" aria-label={`${participantCount}명 참여 중`}>
          <Users aria-hidden="true" className="size-4" />
          <span>{participantCount}명</span>
        </span>
      </div>
    </header>
  );
}
