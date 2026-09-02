import * as React from "react";

import { useSessionStore, useSessionStoreApi } from "./session-store";

export type MessageViewportController = Readonly<{
  viewportRef: React.RefObject<HTMLElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  atLatest: boolean;
  newMessageCount: number;
  handleScroll(): void;
  scrollToLatest(): void;
}>;

export function useMessageViewport(
  sessionId: string,
  messageIds: readonly string[],
): MessageViewportController {
  const store = useSessionStoreApi();
  const newMessageCount = useSessionStore((state) => state.newMessageCount);
  const viewportRef = React.useRef<HTMLElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const atLatestRef = React.useRef(true);
  const scrollTopRef = React.useRef(0);
  const [atLatest, setAtLatest] = React.useState(true);
  const previousRef = React.useRef<{
    sessionId: string;
    messageIds: readonly string[];
    scrollHeight: number;
  } | null>(null);

  const updateLatestState = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    scrollTopRef.current = viewport.scrollTop;
    const nextAtLatest =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
    atLatestRef.current = nextAtLatest;
    setAtLatest((current) => (current === nextAtLatest ? current : nextAtLatest));
    if (nextAtLatest) store.getState().clearNewMessageCount();
  }, [store]);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previous = previousRef.current;
    const sessionChanged = previous?.sessionId !== sessionId;

    if (sessionChanged || previous === null) {
      viewport.scrollTop = viewport.scrollHeight;
      scrollTopRef.current = viewport.scrollTop;
      atLatestRef.current = true;
      setAtLatest(true);
      store.getState().clearNewMessageCount();
    } else {
      const previousFirstId = previous.messageIds[0];
      const previousLastId = previous.messageIds.at(-1);
      const firstPreviousIndex = previousFirstId
        ? messageIds.indexOf(previousFirstId)
        : -1;
      const lastPreviousIndex = previousLastId
        ? messageIds.lastIndexOf(previousLastId)
        : -1;
      const prepended = firstPreviousIndex > 0;
      const appendedCount =
        lastPreviousIndex >= 0 ? messageIds.length - lastPreviousIndex - 1 : 0;

      if (prepended) {
        viewport.scrollTop =
          scrollTopRef.current + (viewport.scrollHeight - previous.scrollHeight);
        scrollTopRef.current = viewport.scrollTop;
      }

      if (appendedCount > 0) {
        if (atLatestRef.current) {
          viewport.scrollTop = viewport.scrollHeight;
          scrollTopRef.current = viewport.scrollTop;
        } else {
          store.getState().addNewMessageCount(appendedCount);
        }
      }

      const nextAtLatest =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
      atLatestRef.current = nextAtLatest;
      setAtLatest((current) => (current === nextAtLatest ? current : nextAtLatest));
      if (nextAtLatest) store.getState().clearNewMessageCount();
    }

    previousRef.current = {
      sessionId,
      messageIds: [...messageIds],
      scrollHeight: viewport.scrollHeight,
    };
  }, [messageIds, sessionId, store]);

  return {
    viewportRef,
    bottomRef,
    atLatest,
    newMessageCount,
    handleScroll: updateLatestState,
    scrollToLatest: () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      atLatestRef.current = true;
      setAtLatest(true);
      store.getState().clearNewMessageCount();
    },
  };
}
