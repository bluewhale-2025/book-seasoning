import { Injectable } from "@nestjs/common";

import {
  BookContextDocumentV1Schema,
  HostContextV1Schema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type BookContextDocumentV1,
  type HostContextV1,
  type LivingWikiDocumentV1,
  type PolicyDecisionV1,
  type PublicContextV1,
  type PublicEvaluatorOutputV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

const HOST_MESSAGE_LIMIT = 40;
const HOST_BOOK_ITEM_LIMIT = 8;
const BOOK_RECONNECTION_ACTIONS = new Set([
  "RECONNECT_TO_BOOK",
  "RECONNECT_AND_REFLECT",
]);
const BOOK_SECTION_PRIORITY = [
  "DISCUSSION_ISSUES",
  "SCENES_AND_CLAIMS",
  "THEMES",
  "INTERPRETATION_CAUTIONS",
] as const;

export type BuildHostContextInput = Readonly<{
  publicContext: PublicContextV1;
  evaluation: PublicEvaluatorOutputV1;
  committedWiki: LivingWikiDocumentV1;
  policy: PolicyDecisionV1;
}>;

export class HostContextBuildError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "HostContextBuildError";
  }
}

@Injectable()
export class HostContextBuilder {
  public build(input: BuildHostContextInput): HostContextV1 {
    if (
      input.policy.action === "WAIT" ||
      input.policy.action === "RECOMMEND_EXTENSION"
    ) {
      throw new HostContextBuildError("HOST_ACTION_NOT_MESSAGE_GENERATION");
    }
    const messages = input.publicContext.messages.slice(-HOST_MESSAGE_LIMIT);
    const bookContext = this.bookSubset(input);
    const allowedEvidenceRefs = this.allowedEvidence(messages, bookContext);
    return HostContextV1Schema.parse({
      schemaVersion: "host-context.v1",
      session: {
        sessionId: input.publicContext.session.sessionId,
        roomId: input.publicContext.session.roomId,
        pinnedPackVersionId:
          input.publicContext.session.pinnedPackVersionId,
        phase: input.publicContext.session.phase,
        phaseVersion: input.publicContext.session.phaseVersion,
        basedThroughSeq: input.evaluation.targetThroughSeq,
      },
      policy: input.policy,
      discussionState: {
        summary: input.evaluation.summaryState,
        currentTopic: input.committedWiki.currentTopic,
        majorPerspectives: input.evaluation.majorPerspectives,
        bookGrounding: input.evaluation.bookGrounding,
        openIssues: input.committedWiki.issueAndQuestionMap
          .filter((issue) => issue.status !== "COVERED")
          .slice(0, 30),
      },
      messages,
      bookContext,
      allowedEvidenceRefs,
    });
  }

  private bookSubset(input: BuildHostContextInput): BookContextDocumentV1 {
    const document = input.publicContext.bookContext;
    const selectedIds = new Set(
      collectPublicEvidenceRefs([
        input.policy.supportingEvidenceRefs,
        input.evaluation.currentTopic,
        input.evaluation.majorPerspectives,
        input.evaluation.bookGrounding,
      ]).flatMap((reference) =>
        reference.type === "BOOK_CONTEXT_ITEM" ? [reference.itemId] : [],
      ),
    );
    if (BOOK_RECONNECTION_ACTIONS.has(input.policy.action)) {
      for (const code of BOOK_SECTION_PRIORITY) {
        const section = document.sections.find((value) => value.code === code);
        for (const item of section?.items ?? []) {
          if (selectedIds.size >= HOST_BOOK_ITEM_LIMIT) break;
          selectedIds.add(item.itemId);
        }
      }
    }
    const limitedIds = new Set([...selectedIds].slice(0, HOST_BOOK_ITEM_LIMIT));
    const itemSources = document.itemSources.filter((relation) =>
      limitedIds.has(relation.itemId),
    );
    const sourceIds = new Set(itemSources.map((relation) => relation.sourceId));
    return BookContextDocumentV1Schema.parse({
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => limitedIds.has(item.itemId)),
      })),
      itemLinks: document.itemLinks.filter(
        (link) =>
          limitedIds.has(link.fromItemId) && limitedIds.has(link.toItemId),
      ),
      sources: document.sources.filter((source) =>
        sourceIds.has(source.sourceId),
      ),
      itemSources,
    });
  }

  private allowedEvidence(
    messages: HostContextV1["messages"],
    bookContext: BookContextDocumentV1,
  ): PublicEvidenceRef[] {
    const evidence = new Map<string, PublicEvidenceRef>();
    for (const item of bookContext.sections.flatMap((section) => section.items)) {
      const reference: PublicEvidenceRef = {
        type: "BOOK_CONTEXT_ITEM",
        packVersionId: bookContext.packVersionId,
        itemId: item.itemId,
      };
      evidence.set(publicEvidenceRefKey(reference), reference);
    }
    for (const message of messages) {
      const reference: PublicEvidenceRef =
        message.kind === "PARTICIPANT"
          ? {
              type: "MESSAGE",
              messageId: message.messageId,
              seqNo: message.seqNo,
            }
          : {
              type: "AI_INTERVENTION",
              messageId: message.messageId,
              seqNo: message.seqNo,
            };
      evidence.set(publicEvidenceRefKey(reference), reference);
    }
    return [...evidence.values()].slice(0, 24);
  }
}
