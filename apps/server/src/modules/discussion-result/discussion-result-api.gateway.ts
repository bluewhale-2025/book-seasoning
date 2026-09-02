import type {
  ClosingResponseCommandResponse,
  DeleteClosingResponseRequest,
  GetDiscussionResultResponse,
  RetryDiscussionResultResponse,
  UpsertClosingResponseRequest,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export class DiscussionResultGatewayError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "DiscussionResultGatewayError";
  }
}

export interface DiscussionResultApiGateway {
  upsertClosing(
    actor: AuthenticatedActor,
    input: UpsertClosingResponseRequest &
      Readonly<{ roomId: string; requestFingerprint: string }>,
  ): Promise<ClosingResponseCommandResponse>;
  deleteClosing(
    actor: AuthenticatedActor,
    input: DeleteClosingResponseRequest &
      Readonly<{ roomId: string; requestFingerprint: string }>,
  ): Promise<ClosingResponseCommandResponse>;
  getResult(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<GetDiscussionResultResponse>;
  retryResult(
    actor: AuthenticatedActor,
    input: Readonly<{
      roomId: string;
      commandId: string;
      requestFingerprint: string;
    }>,
  ): Promise<RetryDiscussionResultResponse>;
}

export const DISCUSSION_RESULT_API_GATEWAY = Symbol(
  "DISCUSSION_RESULT_API_GATEWAY",
);
