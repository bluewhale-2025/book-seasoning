import type {
  AdminBookSelection,
  AdminBookContextPackListResponse,
  AdminBookContextPackSnapshot,
  AdminPackCommandResponse,
  BuilderPackCommandRequest,
  CreateBookContextPackResponse,
  CompleteBookContextReviewRequest,
  PublishBookContextPackRequest,
  ProposalCommandRequest,
  RegenerateBookContextRequest,
  RegenerateBookContextResponse,
  RetireBookContextPackRequest,
  RetryBookBuilderRunRequest,
  RetryBookBuilderRunResponse,
  UpdateBookContextDraftRequest,
} from "@bookseasoning/contracts/admin";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export class BookBuilderAdminGatewayError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "BookBuilderAdminGatewayError";
  }
}

type WithFingerprint<T> = T & Readonly<{ requestFingerprint: string }>;

export interface BookBuilderAdminGateway {
  assertAdmin(actor: AuthenticatedActor): Promise<void>;
  create(
    actor: AuthenticatedActor,
    input: WithFingerprint<Readonly<{
      commandId: string;
      selection: AdminBookSelection;
    }>>,
  ): Promise<CreateBookContextPackResponse>;
  list(actor: AuthenticatedActor): Promise<AdminBookContextPackListResponse>;
  get(
    actor: AuthenticatedActor,
    packVersionId: string,
  ): Promise<AdminBookContextPackSnapshot>;
  updateDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<UpdateBookContextDraftRequest>,
  ): Promise<AdminPackCommandResponse>;
  review(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<CompleteBookContextReviewRequest>,
  ): Promise<AdminPackCommandResponse>;
  returnToDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<BuilderPackCommandRequest>,
  ): Promise<AdminPackCommandResponse>;
  publish(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<PublishBookContextPackRequest>,
  ): Promise<AdminPackCommandResponse>;
  retire(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<RetireBookContextPackRequest>,
  ): Promise<AdminPackCommandResponse>;
  retry(
    actor: AuthenticatedActor,
    runId: string,
    input: WithFingerprint<RetryBookBuilderRunRequest>,
  ): Promise<RetryBookBuilderRunResponse>;
  regenerate(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: WithFingerprint<RegenerateBookContextRequest>,
  ): Promise<RegenerateBookContextResponse>;
  applyProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    input: WithFingerprint<ProposalCommandRequest>,
  ): Promise<AdminPackCommandResponse>;
  discardProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    input: WithFingerprint<ProposalCommandRequest>,
  ): Promise<AdminPackCommandResponse>;
}

export const BOOK_BUILDER_ADMIN_GATEWAY = Symbol("BOOK_BUILDER_ADMIN_GATEWAY");
