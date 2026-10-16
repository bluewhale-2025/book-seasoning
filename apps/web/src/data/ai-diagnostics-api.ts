import { AdminAiDiagnosticsSchema } from "@bookseasoning/contracts/admin";

import type { AuthenticatedHttpClient } from "./http-client";

export function readAiDiagnostics(http: AuthenticatedHttpClient, roomId: string, signal: AbortSignal) {
  return http.request(
    `/v1/admin/rooms/${encodeURIComponent(roomId)}/ai-diagnostics`,
    { method: "GET", cache: "no-store", signal },
    AdminAiDiagnosticsSchema,
  );
}
