import * as React from "react";

import { WebEnvironmentError } from "../../data/environment";
import {
  createBrowserDiscussionSessionDependencies,
  type DiscussionSessionDependencies,
} from "./discussion-session-dependencies";
import { DiscussionSessionScreen } from "./discussion-session-screen";
import { SessionStoreProvider } from "./session-store";

export type { DiscussionSessionDependencies } from "./discussion-session-dependencies";

type DiscussionSessionPageProps = Readonly<{
  roomId: string;
  dependencies?: DiscussionSessionDependencies;
}>;

export function DiscussionSessionPage({
  roomId,
  dependencies,
}: DiscussionSessionPageProps) {
  const resolved = React.useMemo(() => {
    if (dependencies) return { dependencies } as const;
    try {
      return { dependencies: createBrowserDiscussionSessionDependencies() } as const;
    } catch (error) {
      return { error } as const;
    }
  }, [dependencies]);

  if ("error" in resolved) {
    const missing =
      resolved.error instanceof WebEnvironmentError
        ? resolved.error.fields.join(", ")
        : "browser configuration";
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <section className="max-w-lg rounded-xl border border-border bg-surface p-6">
          <h1 className="text-section-title m-0">토론 연결 설정이 필요합니다</h1>
          <p className="text-body mb-0 text-muted-foreground">누락된 공개 설정: {missing}</p>
        </section>
      </main>
    );
  }

  return (
    <SessionStoreProvider>
      <DiscussionSessionScreen roomId={roomId} dependencies={resolved.dependencies} />
    </SessionStoreProvider>
  );
}
