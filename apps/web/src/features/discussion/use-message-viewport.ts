import * as React from "react";

import { useSessionStore, useSessionStoreApi } from "./session-store";

export type MessageViewportController = Readonly<{
  bottomRef: React.RefObject<HTMLDivElement | null>;
  newMessageCount: number;
  scrollToLatest(): void;
}>;

export function useMessageViewport(
  sessionId: string,
  latestMessageSeq: number,
): MessageViewportController {
  const store = useSessionStoreApi();
  const newMessageCount = useSessionStore((state) => state.newMessageCount);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const atLatestRef = React.useRef(true);
  const previousLatestSeqRef = React.useRef(0);

  React.useEffect(() => {
    const target = bottomRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        atLatestRef.current = entry?.isIntersecting ?? true;
        if (entry?.isIntersecting) store.getState().clearNewMessageCount();
      },
      { rootMargin: "0px 0px 160px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [sessionId, store]);

  React.useEffect(() => {
    const previous = previousLatestSeqRef.current;
    previousLatestSeqRef.current = latestMessageSeq;
    if (previous === 0 || latestMessageSeq <= previous) return;
    if (atLatestRef.current) bottomRef.current?.scrollIntoView?.({ block: "end" });
    else {
      for (let index = previous; index < latestMessageSeq; index += 1) {
        store.getState().incrementNewMessageCount();
      }
    }
  }, [latestMessageSeq, store]);

  return {
    bottomRef,
    newMessageCount,
    scrollToLatest: () => {
      bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
      store.getState().clearNewMessageCount();
    },
  };
}
