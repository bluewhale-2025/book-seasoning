import {
  AdminBookContextPackListResponseSchema,
  AdminBookContextPackSnapshotSchema,
  AdminPackCommandResponseSchema,
  CreateBookContextPackResponseSchema,
  RegenerateBookContextResponseSchema,
  RetryBookBuilderRunResponseSchema,
} from "@bookseasoning/contracts/admin";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { supabaseRpcErrorCode } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  BookBuilderAdminGatewayError,
  type BookBuilderAdminGateway,
} from "./book-builder-admin.gateway.js";

const fail = (
  error: Readonly<{ code?: string; message: string }>,
  fallback: string,
): never => {
  throw new BookBuilderAdminGatewayError(supabaseRpcErrorCode(error, fallback));
};

export class SupabaseBookBuilderAdminGateway
  implements BookBuilderAdminGateway
{
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async assertAdmin(actor: AuthenticatedActor): Promise<void> {
    const { data, error } = await this.client(actor)
      .from("profiles")
      .select("role")
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (error !== null) fail(error, "admin_access_check_failed");
    if (data?.role !== "ADMIN") {
      throw new BookBuilderAdminGatewayError("admin_required");
    }
  }

  public async create(
    actor: AuthenticatedActor,
    input: Parameters<BookBuilderAdminGateway["create"]>[1],
  ) {
    const { data, error } = await this.client(actor).rpc(
      "admin_create_book_context_pack",
      {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_provider: input.selection.provider,
        p_external_book_id: input.selection.externalBookId,
        p_selection: {
          title: input.selection.title,
          author: input.selection.authors.join(", "),
          translator: input.selection.translators.length === 0
            ? null
            : input.selection.translators.join(", "),
          publisher: input.selection.publisher,
          publicationYear: input.selection.publishedDate === null
            ? null
            : Number(input.selection.publishedDate.slice(0, 4)),
          isbn10: input.selection.isbn10,
          isbn13: input.selection.isbn13,
          coverUrl: input.selection.thumbnailUrl,
          description: input.selection.description,
          detailUrl: input.selection.detailUrl,
        },
      },
    );
    if (error !== null) fail(error, "book_context_create_failed");
    return CreateBookContextPackResponseSchema.parse(data);
  }

  public async list(actor: AuthenticatedActor) {
    const { data, error } = await this.client(actor).rpc(
      "admin_list_book_context_packs",
    );
    if (error !== null) fail(error, "book_context_list_failed");
    return AdminBookContextPackListResponseSchema.parse(data);
  }

  public async get(actor: AuthenticatedActor, packVersionId: string) {
    const { data, error } = await this.client(actor).rpc(
      "admin_get_book_context_pack",
      { p_pack_version_id: packVersionId },
    );
    if (error !== null) fail(error, "book_context_get_failed");
    return AdminBookContextPackSnapshotSchema.parse(data);
  }

  public async updateDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["updateDraft"]>[2],
  ) {
    return this.command(actor, "admin_update_book_context_draft", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_pack_version_id: packVersionId,
      p_expected_revision: input.expectedRevision,
      p_draft: input.draft,
    });
  }

  public async review(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["review"]>[2],
  ) {
    return this.command(actor, "admin_review_book_context_pack", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_pack_version_id: packVersionId,
      p_expected_revision: input.expectedRevision,
      p_acknowledged_warnings: input.acknowledgedWarnings,
    });
  }

  public async returnToDraft(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["returnToDraft"]>[2],
  ) {
    return this.command(actor, "admin_return_book_context_pack_to_draft", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_pack_version_id: packVersionId,
      p_expected_revision: input.expectedRevision,
    });
  }

  public async publish(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["publish"]>[2],
  ) {
    return this.command(actor, "admin_publish_book_context_pack", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_pack_version_id: packVersionId,
      p_expected_revision: input.expectedRevision,
    });
  }

  public async retire(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["retire"]>[2],
  ) {
    return this.command(actor, "admin_retire_book_context_pack", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_pack_version_id: packVersionId,
      p_expected_revision: input.expectedRevision,
      p_reason: input.reason,
    });
  }

  public async retry(
    actor: AuthenticatedActor,
    runId: string,
    input: Parameters<BookBuilderAdminGateway["retry"]>[2],
  ) {
    const { data, error } = await this.client(actor).rpc(
      "admin_retry_book_builder_run",
      {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_run_id: runId,
      },
    );
    if (error !== null) fail(error, "book_builder_retry_failed");
    return RetryBookBuilderRunResponseSchema.parse(data);
  }

  public async regenerate(
    actor: AuthenticatedActor,
    packVersionId: string,
    input: Parameters<BookBuilderAdminGateway["regenerate"]>[2],
  ) {
    const { data, error } = await this.client(actor).rpc(
      "admin_regenerate_book_context_pack",
      {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_pack_version_id: packVersionId,
        p_expected_revision: input.expectedRevision,
        p_scope: input.scope,
        p_target_item_id: input.targetItemId,
      },
    );
    if (error !== null) fail(error, "book_context_regenerate_failed");
    return RegenerateBookContextResponseSchema.parse(data);
  }

  public async applyProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    input: Parameters<BookBuilderAdminGateway["applyProposal"]>[2],
  ) {
    return this.command(actor, "admin_apply_book_context_proposal", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_proposal_id: proposalId,
      p_expected_revision: input.expectedRevision,
    });
  }

  public async discardProposal(
    actor: AuthenticatedActor,
    proposalId: string,
    input: Parameters<BookBuilderAdminGateway["discardProposal"]>[2],
  ) {
    return this.command(actor, "admin_discard_book_context_proposal", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_proposal_id: proposalId,
      p_expected_revision: input.expectedRevision,
    });
  }

  private client(actor: AuthenticatedActor) {
    return createUserSupabaseClient(this.environment, actor);
  }

  private async command(
    actor: AuthenticatedActor,
    name: string,
    parameters: Record<string, unknown>,
  ) {
    const { data, error } = await this.client(actor).rpc(name, parameters);
    if (error !== null) fail(error, "book_context_command_failed");
    return AdminPackCommandResponseSchema.parse(data);
  }
}
