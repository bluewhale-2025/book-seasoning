import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "../ui/button";

export function PendingMessage({
  body,
  status,
  onRetry,
}: {
  body: string;
  status: "pending" | "failed";
  onRetry(): void;
}) {
  return (
    <article className="mt-5 ml-12 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
      <p className="text-chat m-0 whitespace-pre-wrap break-words text-foreground">{body}</p>
      <div className="text-caption mt-2 flex items-center justify-between gap-3 text-muted-foreground">
        {status === "pending" ? (
          <span className="inline-flex items-center gap-1.5" role="status">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            전송 중
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-destructive" role="alert">
              <AlertCircle aria-hidden="true" className="size-3.5" />
              전송하지 못했습니다
            </span>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              같은 메시지 다시 보내기
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
