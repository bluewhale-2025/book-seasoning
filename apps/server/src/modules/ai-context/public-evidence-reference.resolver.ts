import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  PublicEvidenceRefsSchema,
  type AiInterventionEvidenceRef,
  type BookContextItem,
  type MessageEvidenceRef,
  type PublicEvidenceRef,
  type PublicPrepAnswerV1,
  type PublicPrepEvidenceRef,
  type PublicRawMessageV1,
} from "@bookseasoning/contracts/internal";

import {
  BOOK_CONTEXT_PROVIDER,
  type BookContextProvider,
} from "../book-context/book-context.provider.js";
import {
  PUBLIC_CONTEXT_REPOSITORY,
  type PublicContextRepository,
} from "./public-context.repository.js";

export type PublicEvidenceScope = Readonly<{
  sessionId: string;
  roomId: string;
  pinnedPackVersionId: string;
  targetThroughSeq: number;
}>;

export const PUBLIC_EVIDENCE_RESOLVER = Symbol("PUBLIC_EVIDENCE_RESOLVER");

const PublicEvidenceScopeSchema = z.strictObject({
  sessionId: z.uuid(),
  roomId: z.uuid(),
  pinnedPackVersionId: z.uuid(),
  targetThroughSeq: z.int().nonnegative(),
});

export type ResolvedPublicEvidence =
  | Readonly<{ reference: MessageEvidenceRef; message: PublicRawMessageV1 }>
  | Readonly<{
      reference: AiInterventionEvidenceRef;
      message: PublicRawMessageV1;
    }>
  | Readonly<{
      reference: PublicPrepEvidenceRef;
      prep: PublicPrepAnswerV1;
    }>
  | Readonly<{
      reference: Extract<PublicEvidenceRef, { type: "BOOK_CONTEXT_ITEM" }>;
      item: BookContextItem;
    }>;

export interface PublicEvidenceResolver {
  resolve(
    scope: PublicEvidenceScope,
    references: readonly PublicEvidenceRef[],
  ): Promise<readonly ResolvedPublicEvidence[]>;
}

export class PublicEvidenceResolutionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly referenceIndex: number,
  ) {
    super(code);
    this.name = "PublicEvidenceResolutionError";
  }
}

@Injectable()
export class PublicEvidenceReferenceResolver implements PublicEvidenceResolver {
  public constructor(
    @Inject(PUBLIC_CONTEXT_REPOSITORY)
    private readonly repository: PublicContextRepository,
    @Inject(BOOK_CONTEXT_PROVIDER)
    private readonly bookContextProvider: BookContextProvider,
  ) {}

  public async resolve(
    rawScope: PublicEvidenceScope,
    rawReferences: readonly PublicEvidenceRef[],
  ): Promise<readonly ResolvedPublicEvidence[]> {
    const scope = PublicEvidenceScopeSchema.parse(rawScope);
    const references = PublicEvidenceRefsSchema.parse(rawReferences);
    this.validateScope(references, scope);

    const messageIds = references.flatMap((reference) =>
      reference.type === "MESSAGE" || reference.type === "AI_INTERVENTION"
        ? [reference.messageId]
        : [],
    );
    const prepIds = references.flatMap((reference) =>
      reference.type === "PUBLIC_PREP" ? [reference.prepAnswerId] : [],
    );
    const bookItemIds = references.flatMap((reference) =>
      reference.type === "BOOK_CONTEXT_ITEM" ? [reference.itemId] : [],
    );

    const [messages, prep, bookContext] = await Promise.all([
      messageIds.length === 0
        ? Promise.resolve([])
        : this.repository.findMessagesByIds({
            sessionId: scope.sessionId,
            messageIds,
            throughSeq: scope.targetThroughSeq,
          }),
      prepIds.length === 0
        ? Promise.resolve([])
        : this.repository.listPublicPrep({
            sessionId: scope.sessionId,
            prepAnswerIds: prepIds,
          }),
      bookItemIds.length === 0
        ? Promise.resolve(null)
        : this.bookContextProvider.getPackVersion({
            packVersionId: scope.pinnedPackVersionId,
            consumer: "EVALUATOR",
            itemIds: bookItemIds,
            maxItems: bookItemIds.length,
          }),
    ]);

    if (
      bookContext !== null &&
      bookContext.packVersionId !== scope.pinnedPackVersionId
    ) {
      this.fail(
        "BOOK_CONTEXT_PROVIDER_VERSION_MISMATCH",
        references.findIndex(
          (reference) => reference.type === "BOOK_CONTEXT_ITEM",
        ),
      );
    }

    const messagesById = new Map(
      messages.map((message) => [message.messageId, message]),
    );
    const prepById = new Map(prep.map((answer) => [answer.prepAnswerId, answer]));
    const itemsById = new Map(
      (bookContext?.sections ?? [])
        .flatMap((section) => section.items)
        .map((item) => [item.itemId, item]),
    );

    return references.map((reference, index) => {
      switch (reference.type) {
        case "MESSAGE": {
          const message = messagesById.get(reference.messageId);
          if (message === undefined) this.fail("PUBLIC_MESSAGE_NOT_FOUND", index);
          if (message.seqNo !== reference.seqNo)
            this.fail("PUBLIC_MESSAGE_SEQ_MISMATCH", index);
          if (message.kind !== "PARTICIPANT")
            this.fail("PUBLIC_MESSAGE_KIND_MISMATCH", index);
          return { reference, message };
        }
        case "AI_INTERVENTION": {
          const message = messagesById.get(reference.messageId);
          if (message === undefined)
            this.fail("PUBLIC_INTERVENTION_NOT_FOUND", index);
          if (message.seqNo !== reference.seqNo)
            this.fail("PUBLIC_INTERVENTION_SEQ_MISMATCH", index);
          if (message.kind !== "AI_HOST")
            this.fail("PUBLIC_INTERVENTION_KIND_MISMATCH", index);
          return { reference, message };
        }
        case "PUBLIC_PREP": {
          const answer = prepById.get(reference.prepAnswerId);
          if (answer === undefined) this.fail("PUBLIC_PREP_NOT_FOUND", index);
          if (answer.roomId !== scope.roomId)
            this.fail("PUBLIC_PREP_ROOM_MISMATCH", index);
          return { reference, prep: answer };
        }
        case "BOOK_CONTEXT_ITEM": {
          const item = itemsById.get(reference.itemId);
          if (item === undefined) this.fail("BOOK_CONTEXT_ITEM_NOT_FOUND", index);
          return { reference, item };
        }
      }
    });
  }

  private validateScope(
    references: readonly PublicEvidenceRef[],
    scope: PublicEvidenceScope,
  ): void {
    for (const [index, reference] of references.entries()) {
      if (
        (reference.type === "MESSAGE" ||
          reference.type === "AI_INTERVENTION") &&
        reference.seqNo > scope.targetThroughSeq
      ) {
        this.fail("PUBLIC_REFERENCE_CURSOR_EXCEEDED", index);
      }
      if (
        reference.type === "BOOK_CONTEXT_ITEM" &&
        reference.packVersionId !== scope.pinnedPackVersionId
      ) {
        this.fail("BOOK_CONTEXT_PACK_VERSION_MISMATCH", index);
      }
    }
  }

  private fail(code: string, referenceIndex: number): never {
    throw new PublicEvidenceResolutionError(code, referenceIndex);
  }
}
