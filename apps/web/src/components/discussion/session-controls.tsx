import * as React from "react";
import { LoaderCircle, OctagonX, TimerReset } from "lucide-react";

import type { SessionPhase } from "@bookseasoning/contracts/public";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

type SessionControlsProps = Readonly<{
  phase: SessionPhase;
  isHost: boolean;
  extensionDecisionOpen: boolean;
  decisionRemainingSeconds: number;
  canEnd: boolean;
  busyAction: "extend" | "synthesis" | "end" | null;
  errorMessage: string | null;
  onExtend(): Promise<boolean>;
  onStartSynthesis(): Promise<boolean>;
  onEnd(): Promise<boolean>;
}>;

export function SessionControls({
  phase,
  isHost,
  extensionDecisionOpen,
  decisionRemainingSeconds,
  canEnd,
  busyAction,
  errorMessage,
  onExtend,
  onStartSynthesis,
  onEnd,
}: SessionControlsProps) {
  const [endDialogOpen, setEndDialogOpen] = React.useState(false);
  const decisionLocked = decisionRemainingSeconds <= 0 || busyAction !== null;

  return (
    <>
      {(extensionDecisionOpen || canEnd || errorMessage !== null) && (
        <section
          className="border-b border-border bg-surface-muted px-4 py-3 sm:px-5"
          aria-label="세션 운영"
        >
          <div className="mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {extensionDecisionOpen ? (
              <div className="min-w-0">
                <p className="text-label m-0 text-foreground">
                  {isHost
                    ? "토론을 15분 더 이어갈까요?"
                    : "방장이 토론 연장 여부를 결정하고 있어요"}
                </p>
                <p className="text-caption mt-1 mb-0 text-muted-foreground" role="status">
                  {formatDecisionTime(decisionRemainingSeconds)} 안에 결정하지 않으면 자동으로
                  마무리 단계가 시작됩니다.
                </p>
              </div>
            ) : (
              <p className="text-caption m-0 text-muted-foreground">
                현재 단계: {phase === "CLOSING" ? "마지막 정리" : "토론 진행 중"}
              </p>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {extensionDecisionOpen && isHost && (
                <>
                  <Button
                    variant="primary"
                    disabled={decisionLocked}
                    onClick={() => void onExtend()}
                  >
                    {busyAction === "extend" ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <TimerReset aria-hidden="true" />
                    )}
                    15분 연장
                  </Button>
                  <Button
                    disabled={decisionLocked}
                    onClick={() => void onStartSynthesis()}
                  >
                    {busyAction === "synthesis" && (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    )}
                    마무리하기
                  </Button>
                </>
              )}

              {canEnd && (
                <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" disabled={busyAction !== null}>
                      <OctagonX aria-hidden="true" />
                      토론 종료
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>지금 토론을 종료할까요?</DialogTitle>
                      <DialogDescription>
                        종료하면 참가자는 더 이상 메시지를 보내거나 다시 접속할 수 없습니다.
                        이 작업은 되돌릴 수 없습니다.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button>계속 토론하기</Button>
                      </DialogClose>
                      <Button
                        variant="destructive"
                        disabled={busyAction !== null}
                        onClick={() => {
                          void onEnd().then((ended) => {
                            if (ended) setEndDialogOpen(false);
                          });
                        }}
                      >
                        {busyAction === "end" && (
                          <LoaderCircle aria-hidden="true" className="animate-spin" />
                        )}
                        토론 종료하기
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {errorMessage !== null && (
            <p className="text-caption mt-2 mb-0 text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function formatDecisionTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
