import * as React from "react";

import { cn } from "../../lib/utils";

export function TypingIndicator({
  names,
  className,
  ...props
}: React.ComponentProps<"div"> & { names: string[] }) {
  const label = names.length === 1 ? `${names[0]}님이 입력 중` : `${names.join(", ")}님이 입력 중`;

  return (
    <div
      className={cn("text-caption ml-12 flex min-h-7 items-center gap-2 text-muted-foreground", className)}
      role="status"
      aria-live="polite"
      {...props}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        <span className="size-1 rounded-full bg-muted-foreground" />
        <span className="size-1 rounded-full bg-muted-foreground opacity-70" />
        <span className="size-1 rounded-full bg-muted-foreground opacity-40" />
      </span>
      {label}…
    </div>
  );
}

export function NewMessageDivider({
  label = "여기부터 새 메시지",
  className,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      className={cn("my-6 flex items-center gap-3 text-unread", className)}
      role="separator"
      aria-label={label}
      {...props}
    >
      <span className="h-px flex-1 bg-unread/55" />
      <span className="text-caption font-semibold">{label}</span>
      <span className="h-px flex-1 bg-unread/55" />
    </div>
  );
}

export function ParticipantPresence({
  name,
  online = true,
  className,
  ...props
}: React.ComponentProps<"span"> & { name: string; online?: boolean }) {
  return (
    <span className={cn("text-metadata inline-flex items-center gap-1.5", className)} {...props}>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          online ? "bg-presence-online" : "border border-border-strong bg-transparent",
        )}
      />
      <span>{name}</span>
      <span className="sr-only">{online ? "온라인" : "오프라인"}</span>
    </span>
  );
}
