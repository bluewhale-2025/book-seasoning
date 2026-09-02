import {
  AdminBookContextPackListResponseSchema,
  AdminBookContextPackSnapshotSchema,
  AdminPackCommandResponseSchema,
  BuilderPackCommandRequestSchema,
  CreateBookContextPackRequestSchema,
  CreateBookContextPackResponseSchema,
  ProposalCommandRequestSchema,
  PublishBookContextPackRequestSchema,
  RegenerateBookContextRequestSchema,
  RegenerateBookContextResponseSchema,
  RetireBookContextPackRequestSchema,
  RetryBookBuilderRunRequestSchema,
  RetryBookBuilderRunResponseSchema,
  UpdateBookContextDraftRequestSchema,
  type AdminBookContextPackListResponse,
  type AdminBookContextPackSnapshot,
  type AdminPackCommandResponse,
  type BuilderPackCommandRequest,
  type CreateBookContextPackRequest,
  type CreateBookContextPackResponse,
  type ProposalCommandRequest,
  type PublishBookContextPackRequest,
  type RegenerateBookContextRequest,
  type RegenerateBookContextResponse,
  type RetireBookContextPackRequest,
  type RetryBookBuilderRunRequest,
  type RetryBookBuilderRunResponse,
  type UpdateBookContextDraftRequest,
} from "@bookseasoning/contracts/admin";

import type { AuthenticatedHttpClient } from "./http-client";

export type BookBuilderAdminApi = Readonly<{
  listPacks(): Promise<AdminBookContextPackListResponse>;
  createPack(request: CreateBookContextPackRequest): Promise<CreateBookContextPackResponse>;
  getPack(packVersionId: string): Promise<AdminBookContextPackSnapshot>;
  updateDraft(packVersionId: string, request: UpdateBookContextDraftRequest): Promise<AdminPackCommandResponse>;
  requestReview(packVersionId: string, request: BuilderPackCommandRequest): Promise<AdminPackCommandResponse>;
  returnToDraft(packVersionId: string, request: BuilderPackCommandRequest): Promise<AdminPackCommandResponse>;
  publish(packVersionId: string, request: PublishBookContextPackRequest): Promise<AdminPackCommandResponse>;
  retire(packVersionId: string, request: RetireBookContextPackRequest): Promise<AdminPackCommandResponse>;
  retryRun(runId: string, request: RetryBookBuilderRunRequest): Promise<RetryBookBuilderRunResponse>;
  regenerate(packVersionId: string, request: RegenerateBookContextRequest): Promise<RegenerateBookContextResponse>;
  applyProposal(proposalId: string, request: ProposalCommandRequest): Promise<AdminPackCommandResponse>;
  discardProposal(proposalId: string, request: ProposalCommandRequest): Promise<AdminPackCommandResponse>;
}>;

export class HttpBookBuilderAdminApi implements BookBuilderAdminApi {
  public constructor(private readonly http: AuthenticatedHttpClient) {}

  public listPacks() {
    return this.http.request("/v1/admin/book-context/packs", { method: "GET" }, AdminBookContextPackListResponseSchema);
  }

  public createPack(request: CreateBookContextPackRequest) {
    return this.http.request("/v1/admin/book-context/packs", {
      method: "POST",
      body: JSON.stringify(CreateBookContextPackRequestSchema.parse(request)),
    }, CreateBookContextPackResponseSchema);
  }

  public getPack(packVersionId: string) {
    return this.http.request(this.packPath(packVersionId), { method: "GET" }, AdminBookContextPackSnapshotSchema);
  }

  public updateDraft(packVersionId: string, request: UpdateBookContextDraftRequest) {
    return this.command(`${this.packPath(packVersionId)}/draft`, "PUT", UpdateBookContextDraftRequestSchema.parse(request));
  }

  public requestReview(packVersionId: string, request: BuilderPackCommandRequest) {
    return this.command(`${this.packPath(packVersionId)}/review`, "POST", BuilderPackCommandRequestSchema.parse(request));
  }

  public returnToDraft(packVersionId: string, request: BuilderPackCommandRequest) {
    return this.command(`${this.packPath(packVersionId)}/return-to-draft`, "POST", BuilderPackCommandRequestSchema.parse(request));
  }

  public publish(packVersionId: string, request: PublishBookContextPackRequest) {
    return this.command(`${this.packPath(packVersionId)}/publish`, "POST", PublishBookContextPackRequestSchema.parse(request));
  }

  public retire(packVersionId: string, request: RetireBookContextPackRequest) {
    return this.command(`${this.packPath(packVersionId)}/retire`, "POST", RetireBookContextPackRequestSchema.parse(request));
  }

  public retryRun(runId: string, request: RetryBookBuilderRunRequest) {
    return this.http.request(`/v1/admin/book-context/runs/${encodeURIComponent(runId)}/retry`, {
      method: "POST",
      body: JSON.stringify(RetryBookBuilderRunRequestSchema.parse(request)),
    }, RetryBookBuilderRunResponseSchema);
  }

  public regenerate(packVersionId: string, request: RegenerateBookContextRequest) {
    return this.http.request(`${this.packPath(packVersionId)}/regenerate`, {
      method: "POST",
      body: JSON.stringify(RegenerateBookContextRequestSchema.parse(request)),
    }, RegenerateBookContextResponseSchema);
  }

  public applyProposal(proposalId: string, request: ProposalCommandRequest) {
    return this.proposalCommand(proposalId, "apply", request);
  }

  public discardProposal(proposalId: string, request: ProposalCommandRequest) {
    return this.proposalCommand(proposalId, "discard", request);
  }

  private proposalCommand(proposalId: string, action: "apply" | "discard", request: ProposalCommandRequest) {
    return this.command(`/v1/admin/book-context/proposals/${encodeURIComponent(proposalId)}/${action}`, "POST", ProposalCommandRequestSchema.parse(request));
  }

  private command(path: string, method: "POST" | "PUT", request: unknown) {
    return this.http.request(path, { method, body: JSON.stringify(request) }, AdminPackCommandResponseSchema);
  }

  private packPath(packVersionId: string) {
    return `/v1/admin/book-context/packs/${encodeURIComponent(packVersionId)}`;
  }
}
