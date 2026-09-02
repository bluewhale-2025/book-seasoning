import * as React from "react";
import { CornerDownRight } from "lucide-react";

import { cn } from "../../lib/utils";

type InlineReplyProps = React.ComponentProps<"blockquote"> & {
  author: string;
  quote: string;
};

export function InlineReply({ author, quote, className, ...props }: InlineReplyProps) {
  return (
    <blockquote
      className={cn(
        "text-metadata my-1.5 flex min-w-0 items-start gap-1.5 border-l-2 border-accent/55 pl-2.5 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <CornerDownRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-foreground">{author}</span>
        <span aria-hidden="true"> · </span>
        <q>{quote}</q>
      </span>
    </blockquote>
  );
}
