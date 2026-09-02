import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  BuilderPackCommandRequest,
  CreateBookContextPackRequest,
  PublishBookContextPackRequest,
  ProposalCommandRequest,
  RegenerateBookContextRequest,
  RetireBookContextPackRequest,
  RetryBookBuilderRunRequest,
  UpdateBookContextDraftRequest,
} from "@bookseasoning/contracts/admin";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  BOOK_BUILDER_ADMIN_GATEWAY,
  BookBuilderAdminGatewayError,
  type BookBuilderAdminGateway,
} from "./book-builder-admin.gateway.js";

@Injectable()
export class BookBuilderAdminService {
  public constructor(
    @Inject(BOOK_BUILDER_ADMIN_GATEWAY)
    private readonly gateway: BookBuilderAdminGateway,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public create(actor: AuthenticatedActor, request: CreateBookContextPackRequest) {
    return this.run(() =>
      this.gateway.create(actor, {
        ...request,
        requestFingerprint: this.fingerprint("CREATE_PACK", request),
      }),
    );
  }

  public list(actor: AuthenticatedActor) {
    return this.run(() => this.gateway.list(actor));
  }

  public get(actor: AuthenticatedActor, packVersionId: string) {
    return this.run(() => this.gateway.get(actor, packVersionId));
  }

  public updateDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: UpdateBookContextDraftRequest,
  ) {
    return this.run(() =>
      this.gateway.updateDraft(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("UPDATE_PACK_DRAFT", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public review(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: BuilderPackCommandRequest,
  ) {
    return this.run(() =>
      this.gateway.review(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("REVIEW_PACK", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public returnToDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: BuilderPackCommandRequest,
  ) {
    return this.run(() =>
      this.gateway.returnToDraft(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("RETURN_PACK_TO_DRAFT", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public publish(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: PublishBookContextPackRequest,
  ) {
    return this.run(() =>
      this.gateway.publish(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("PUBLISH_PACK", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public retire(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: RetireBookContextPackRequest,
  ) {
    return this.run(() =>
      this.gateway.retire(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("RETIRE_PACK", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public retry(
    actor: AuthenticatedActor,
    runId: string,
    request: RetryBookBuilderRunRequest,
  ) {
    return this.run(() =>
      this.gateway.retry(actor, runId, {
        ...request,
        requestFingerprint: this.fingerprint("RETRY_BOOK_BUILDER", {
          runId,
          ...request,
        }),
      }),
    );
  }

  public regenerate(
    actor: AuthenticatedActor,
    packVersionId: string,
    request: RegenerateBookContextRequest,
  ) {
    return this.run(() =>
      this.gateway.regenerate(actor, packVersionId, {
        ...request,
        requestFingerprint: this.fingerprint("REGENERATE_BOOK_CONTEXT", {
          packVersionId,
          ...request,
        }),
      }),
    );
  }

  public applyProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    request: ProposalCommandRequest,
  ) {
    return this.run(() =>
      this.gateway.applyProposal(actor, proposalId, {
        ...request,
        requestFingerprint: this.fingerprint("APPLY_BOOK_CONTEXT_PROPOSAL", {
          proposalId,
          ...request,
        }),
      }),
    );
  }

  public discardProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    request: ProposalCommandRequest,
  ) {
    return this.run(() =>
      this.gateway.discardProposal(actor, proposalId, {
        ...request,
        requestFingerprint: this.fingerprint("DISCARD_BOOK_CONTEXT_PROPOSAL", {
          proposalId,
          ...request,
        }),
      }),
    );
  }

  private fingerprint(command: string, payload: unknown): string {
    return createCommandFingerprint(
      this.environment.commandFingerprintKey,
      command,
      payload,
    );
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof BookBuilderAdminGatewayError)) throw error;
      const errors = {
        admin_required: [
          HttpStatus.FORBIDDEN,
          "ADMIN_REQUIRED",
          "관리자 권한이 필요합니다.",
        ],
        book_context_pack_not_found: [
          HttpStatus.NOT_FOUND,
          "BOOK_CONTEXT_PACK_NOT_FOUND",
          "Book Context Pack을 찾을 수 없습니다.",
        ],
        book_builder_revision_conflict: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_REVISION_CONFLICT",
          "초안이 변경되었습니다. 최신 상태를 다시 확인해주세요.",
        ],
        book_builder_draft_locked: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_DRAFT_LOCKED",
          "현재 상태에서는 초안을 변경할 수 없습니다.",
        ],
        book_builder_run_incomplete: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_RUN_INCOMPLETE",
          "Builder 작업이 완료된 뒤 검수를 시작할 수 있습니다.",
        ],
        book_builder_retry_unavailable: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_RETRY_UNAVAILABLE",
          "현재 Builder 작업은 재시도할 수 없습니다.",
        ],
        book_builder_retry_stale: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_RETRY_STALE",
          "초안이 변경되어 이 작업을 재시도할 수 없습니다. 새 재생성을 시작해주세요.",
        ],
        book_builder_proposal_pending: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_PROPOSAL_PENDING",
          "먼저 대기 중인 재생성 변경안을 적용하거나 폐기해주세요.",
        ],
        book_builder_proposal_resolved: [
          HttpStatus.CONFLICT,
          "BOOK_BUILDER_PROPOSAL_RESOLVED",
          "이미 처리된 재생성 변경안입니다.",
        ],
        book_context_item_not_found: [
          HttpStatus.NOT_FOUND,
          "BOOK_CONTEXT_ITEM_NOT_FOUND",
          "재생성할 항목을 찾을 수 없습니다.",
        ],
        book_context_publish_blocked: [
          HttpStatus.CONFLICT,
          "BOOK_CONTEXT_PUBLISH_BLOCKED",
          "필수 검수 항목을 해결한 뒤 게시할 수 있습니다.",
        ],
        book_context_warnings_unacknowledged: [
          HttpStatus.CONFLICT,
          "BOOK_CONTEXT_WARNINGS_UNACKNOWLEDGED",
          "게시 경고를 확인해주세요.",
        ],
        command_payload_mismatch: [
          HttpStatus.CONFLICT,
          "COMMAND_PAYLOAD_MISMATCH",
          "같은 요청 식별자가 다른 내용에 사용되었습니다.",
        ],
      } as const satisfies Record<string, readonly [HttpStatus, string, string]>;
      const mapped = errors[error.code as keyof typeof errors];
      if (mapped === undefined) throw error;
      throw new PublicHttpException(mapped[0], mapped[1], mapped[2]);
    }
  }
}
