import * as React from "react";
import { Clock3 } from "lucide-react";

import { cn } from "../../lib/utils";
import type { SessionPhase } from "@bookseasoning/contracts/public";

type SessionTimerProps = React.ComponentProps<"span"> & {
  remainingSeconds: number;
  phase: SessionPhase;
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function SessionTimer({
  remainingSeconds,
  phase,
  className,
  ...props
}: SessionTimerProps) {
  const endingSoon = remainingSeconds > 0 && remainingSeconds < 300;
  const ended = remainingSeconds <= 0;
  const label = timerLabel(phase, endingSoon, ended);

  return (
    <span
      className={cn(
        "text-metadata inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-sm px-1 font-semibold tabular-nums",
        endingSoon && "bg-warning-background px-2 text-warning",
        ended && "bg-surface-muted px-2 text-muted-foreground",
        className,
      )}
      aria-label={`${label} ${formatTime(remainingSeconds)}`}
      {...props}
    >
      <Clock3 aria-hidden="true" className="size-4" />
      <span>{formatTime(remainingSeconds)}</span>
      {(endingSoon || ended) && <span className="hidden sm:inline">{label}</span>}
    </span>
  );
}

function timerLabel(phase: SessionPhase, endingSoon: boolean, ended: boolean) {
  if (phase === "ENDED" || phase === "CANCELED") return "세션 종료";
  if (phase === "CLOSING") {
    if (ended) return "종료 처리 중";
    return endingSoon ? "마지막 정리 종료 임박" : "마지막 정리 남은 시간";
  }
  if (phase === "SYNTHESIS") {
    if (ended) return "마지막 정리 전환 중";
    return endingSoon ? "마무리 종료 임박" : "마무리 남은 시간";
  }
  if (ended) return "마무리 전환 중";
  return endingSoon ? "토론 종료 임박" : "토론 남은 시간";
}
