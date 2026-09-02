import * as React from "react";
import { Reply } from "lucide-react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { IconButton } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { InlineReply } from "./inline-reply";

type ParticipantMessageProps = React.ComponentProps<"article"> & {
  author: string;
  initials: string;
  timestamp: string;
  avatarSrc?: string;
  children: React.ReactNode;
  consecutive?: boolean;
  reply?: {
    author: string;
    quote: string;
  };
  onReply?: () => void;
};

export function ParticipantMessage({
  author,
  initials,
  timestamp,
  avatarSrc,
  children,
  consecutive = false,
  reply,
  onReply,
  className,
  ...props
}: ParticipantMessageProps) {
  return (
    <article
      className={cn(
        "group/message relative grid grid-cols-[36px_minmax(0,1fr)] gap-3",
        consecutive ? "mt-2" : "mt-6 first:mt-0",
        className,
      )}
      {...props}
    >
      {consecutive ? (
        <div className="min-h-px">
          <time
            className="text-caption mt-1 hidden text-right text-muted-foreground sm:block sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100"
            dateTime={timestamp}
          >
            {timestamp}
          </time>
        </div>
      ) : (
        <Avatar aria-label={`${author}의 아바타`}>
          {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      )}

      <div className="min-w-0">
        {!consecutive && (
          <header className="mb-1 flex min-h-[19px] items-center gap-2 max-sm:pr-10">
            <span className="text-metadata font-semibold text-foreground">{author}</span>
            <time className="text-caption text-muted-foreground" dateTime={timestamp}>
              {timestamp}
            </time>
          </header>
        )}
        {reply && <InlineReply author={reply.author} quote={reply.quote} />}
        <div className="text-chat max-w-[62ch] break-words text-foreground">{children}</div>
      </div>

      {onReply && (
        <div className="absolute -top-2 right-0 flex items-center rounded-md border border-border bg-surface-elevated p-0.5 opacity-0 shadow-[var(--shadow-low)] group-hover/message:opacity-100 group-focus-within/message:opacity-100 max-sm:top-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:opacity-100 max-sm:shadow-none">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton label={`${author}님에게 답장`} variant="ghost" className="size-10" onClick={onReply}>
                <Reply aria-hidden="true" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>인라인 답장</TooltipContent>
          </Tooltip>
        </div>
      )}
    </article>
  );
}

export function ConsecutiveMessageGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("grid", className)} {...props} />;
}
