import * as React from "react";
import { SendHorizontal, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { IconButton } from "../ui/button";

type MessageComposerProps = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  placeholder?: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  replyingTo?: string;
  replyingQuote?: string;
  sticky?: boolean;
  onSubmit?: (message: string) => void;
  onTypingChange?: (typing: boolean) => void;
  onCancelReply?: () => void;
};

export function MessageComposer({
  placeholder = "생각을 나눠주세요…",
  disabled = false,
  disabledPlaceholder = "대화를 동기화하는 동안 기다려 주세요…",
  replyingTo,
  replyingQuote,
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
  const previousReplyingToRef = React.useRef<string | undefined>(undefined);
  const helpId = React.useId();

  React.useEffect(() => {
    if (replyingTo && replyingTo !== previousReplyingToRef.current) {
      textareaRef.current?.focus({ preventScroll: true });
    }
    previousReplyingToRef.current = replyingTo;
  }, [replyingTo]);

  React.useEffect(() => {
    if (disabled) onTypingChange?.(false);
  }, [disabled, onTypingChange]);

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
        "shrink-0 border-t border-border bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4",
        sticky && "sticky bottom-0 z-20",
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {replyingTo && (
        <div className="text-caption mb-2 flex min-w-0 items-center justify-between gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-muted-foreground">
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">{replyingTo}님에게 답장</span>
            {replyingQuote && <span className="block truncate">{replyingQuote}</span>}
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
          placeholder={disabled ? disabledPlaceholder : placeholder}
          aria-describedby={helpId}
          enterKeyHint="send"
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
          onBlur={() => onTypingChange?.(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && replyingTo && onCancelReply) {
              event.preventDefault();
              onCancelReply();
              return;
            }
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
      <div id={helpId} className="text-caption mt-1.5 flex justify-between gap-3 px-1 text-muted-foreground">
        <span>Enter로 보내기 · Shift+Enter로 줄바꿈</span>
        {message.length >= 1800 && (
          <span className="shrink-0 tabular-nums" aria-live="polite">{message.length}/2000</span>
        )}
      </div>
    </form>
  );
}
