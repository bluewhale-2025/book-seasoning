import * as React from "react";

import { cn } from "../../lib/utils";
import { BookCover } from "./book-cover";

type BookIdentityProps = React.ComponentProps<"div"> & {
  title: string;
  author: string;
  coverSrc?: string;
  compact?: boolean;
};

export function BookIdentity({
  title,
  author,
  coverSrc,
  compact = false,
  className,
  ...props
}: BookIdentityProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)} {...props}>
      <BookCover title={title} src={coverSrc} size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <div className="truncate text-[15px] leading-5 font-semibold tracking-[-0.01em]">
          {title}
        </div>
        <div className={cn("text-metadata mt-0.5 text-muted-foreground", compact && "sr-only")}>
          {author}
        </div>
      </div>
    </div>
  );
}
