import { useEffect } from "react";

import { useAppRuntime } from "../../app/app-runtime";
import { readAiDiagnostics } from "../../data/ai-diagnostics-api";
import { HttpClientError } from "../../data/http-client";
import { useProfileQuery } from "../profile/profile-query";

export function AiDiagnosticsConsole({ roomId }: Readonly<{ roomId: string }>) {
  const { http } = useAppRuntime();
  const { data: profile } = useProfileQuery();
  const enabled = profile?.role === "ADMIN";

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function check() {
      try {
        const state = await readAiDiagnostics(http, roomId, controller.signal);
        if (stopped) return;
        // This contract contains only content-free diagnostics, never raw context.
        console.log("[AI state]", state);
        if (["ENDED", "CANCELED"].includes(state.phase)) return;
      } catch (error) {
        if (stopped) return;
        // Never log the error object, request, response body or credentials.
        console.log("[AI state]", {
          status: "UNAVAILABLE",
          code: error instanceof HttpClientError ? error.code : "DIAGNOSTICS_UNAVAILABLE",
        });
        if (error instanceof HttpClientError && [401, 403, 404].includes(error.status)) return;
      }
      if (!stopped) timer = setTimeout(() => void check(), 5_000);
    }

    void check();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, http, roomId]);

  return null;
}
