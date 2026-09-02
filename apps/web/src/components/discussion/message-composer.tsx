import * as React from "react";
import { SendHorizontal, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { IconButton } from "../ui/button";

type MessageComposerProps = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  placeholder?: string;
  disabled?: boolean;
  replyingTo?: string;
  sticky?: boolean;
  onSubmit?: (message: string) => void;
  onTypingChange?: (typing: boolean) => void;
  onCancelReply?: () => void;
};

export function MessageComposer({
  placeholder = "생각을 나눠주세요…",
  disabled = false,
  replyingTo,
  sticky = true,
  onSubmit,
  onTypingChange,
  onCancelReply,
  className,
  ...props
}: MessageComposerProps) {
  const [message, setMessage] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const composingRef = React.useRef(false);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    onSubmit?.(trimmed);
    onTypingChange?.(false);
    setMessage("");
    requestAnimationFrame(resizeTextarea);
  }

  return (
    <form
      className={cn(
        "border-t border-border bg-surface px-3 py-3 sm:px-4",
        sticky && "sticky bottom-0 z-20",
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {replyingTo && (
        <div className="text-caption mb-2 flex items-center justify-between gap-2 px-1 text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{replyingTo}</span>님에게 답장
          </span>
          {onCancelReply && (
            <IconButton
              label="답장 취소"
              variant="ghost"
              className="size-8"
              onClick={onCancelReply}
            >
              <X aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
      <div className="flex min-h-[52px] items-end gap-2 rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        <label className="sr-only" htmlFor="discussion-message">
          토론 메시지
        </label>
        <textarea
          ref={textareaRef}
          id="discussion-message"
          rows={1}
          value={message}
          disabled={disabled}
          maxLength={2000}
          placeholder={disabled ? "세션이 종료되었습니다" : placeholder}
          onChange={(event) => {
            setMessage(event.target.value);
            onTypingChange?.(event.target.value.trim().length > 0);
            resizeTextarea();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1 text-[16px] leading-7 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <IconButton
          label="메시지 보내기"
          variant="primary"
          className="size-10"
          disabled={disabled || !message.trim()}
          type="submit"
        >
          <SendHorizontal aria-hidden="true" />
        </IconButton>
      </div>
      <p className="text-caption mt-1.5 mb-0 px-1 text-muted-foreground">
        Enter로 보내기 · Shift+Enter로 줄바꿈
      </p>
    </form>
  );
}
