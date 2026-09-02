import { isDeepStrictEqual } from "node:util";

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  LivingWikiDocumentV1Schema,
  LivingWikiPatchV1Schema,
  LivingWikiVersionV1Schema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type LivingWikiDocumentV1,
  type LivingWikiMetricsAndKeyChanges,
  type LivingWikiPatchOperationV1,
  type LivingWikiVersionV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  PUBLIC_EVIDENCE_RESOLVER,
  PublicEvidenceResolutionError,
  type PublicEvidenceResolver,
  type PublicEvidenceScope,
  type ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";

const EVIDENCE_RESOLUTION_BATCH_SIZE = 24;

const LivingWikiPatchScopeSchema = z.strictObject({
  sessionId: z.uuid(),
  roomId: z.uuid(),
  pinnedPackVersionId: z.uuid(),
  targetThroughSeq: z.int().nonnegative(),
});

type LivingWikiDraft = Omit<
  LivingWikiDocumentV1,
  "metricsAndKeyChanges"
> & {
  metricsAndKeyChanges: LivingWikiMetricsAndKeyChanges | undefined;
};

export type ApplyLivingWikiPatchInput = Readonly<{
  scope: PublicEvidenceScope;
  currentWiki: LivingWikiVersionV1 | null;
  patch: unknown;
}>;

export type LivingWikiPatchApplication = Readonly<{
  baseVersion: number;
  basedThroughSeq: number;
  document: LivingWikiDocumentV1;
  documentChanged: boolean;
  cursorAdvanced: boolean;
}>;

export class LivingWikiPatchError extends Error {
  public constructor(
    public readonly code: string,
    public readonly operationIndex: number | null = null,
    public readonly causeCode: string | null = null,
  ) {
    super(code);
    this.name = "LivingWikiPatchError";
  }
}

@Injectable()
export class LivingWikiPatchEngine {
  public constructor(
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
  ) {}

  public async apply(
    input: ApplyLivingWikiPatchInput,
  ): Promise<LivingWikiPatchApplication> {
    const scopeResult = LivingWikiPatchScopeSchema.safeParse(input.scope);
    if (!scopeResult.success) {
      this.fail("LIVING_WIKI_SCOPE_INVALID");
    }
    const scope = scopeResult.data;

    const patchResult = LivingWikiPatchV1Schema.safeParse(input.patch);
    if (!patchResult.success) {
      this.fail("LIVING_WIKI_PATCH_SCHEMA_INVALID");
    }
    const patch = patchResult.data;
    const currentWiki = this.parseCurrentWiki(input.currentWiki);

    this.validateEnvelope(scope, currentWiki, patch.baseVersion, patch.basedThroughSeq);

    const draft = this.createDraft(currentWiki);
    for (const [operationIndex, operation] of patch.operations.entries()) {
      this.applyOperation(draft, operation, operationIndex);
    }
    this.validateRelations(draft);

    const documentResult = LivingWikiDocumentV1Schema.safeParse(draft);
    if (!documentResult.success) {
      this.fail("LIVING_WIKI_DOCUMENT_INVALID");
    }
    const document = documentResult.data;

    await this.validateEvidence(scope, [
      ...collectPublicEvidenceRefs(patch),
      ...collectPublicEvidenceRefs(document),
    ]);

    return {
      baseVersion: patch.baseVersion,
      basedThroughSeq: patch.basedThroughSeq,
      document,
      documentChanged:
        currentWiki === null ||
        !isDeepStrictEqual(currentWiki.document, document),
      cursorAdvanced:
        patch.basedThroughSeq > (currentWiki?.basedThroughSeq ?? 0),
    };
  }

  private parseCurrentWiki(
    value: LivingWikiVersionV1 | null,
  ): LivingWikiVersionV1 | null {
    if (value === null) return null;
    const result = LivingWikiVersionV1Schema.safeParse(value);
    if (!result.success) this.fail("LIVING_WIKI_BASE_DOCUMENT_INVALID");
    return result.data;
  }

  private validateEnvelope(
    scope: PublicEvidenceScope,
    currentWiki: LivingWikiVersionV1 | null,
    patchBaseVersion: number,
    patchCursor: number,
  ): void {
    if (currentWiki !== null && currentWiki.sessionId !== scope.sessionId) {
      this.fail("LIVING_WIKI_SESSION_MISMATCH");
    }
    if (currentWiki?.kind === "FINAL") {
      this.fail("LIVING_WIKI_FINAL_LOCKED");
    }
    if (patchBaseVersion !== (currentWiki?.version ?? 0)) {
      this.fail("LIVING_WIKI_BASE_VERSION_MISMATCH");
    }
    if (patchCursor !== scope.targetThroughSeq) {
      this.fail("LIVING_WIKI_CURSOR_MISMATCH");
    }
    if (patchCursor < (currentWiki?.basedThroughSeq ?? 0)) {
      this.fail("LIVING_WIKI_CURSOR_REGRESSION");
    }
  }

  private createDraft(currentWiki: LivingWikiVersionV1 | null): LivingWikiDraft {
    if (currentWiki === null) {
      return {
        currentTopic: null,
        perspectiveMap: [],
        bookGrounding: [],
        issueAndQuestionMap: [],
        coverage: [],
        participantState: [],
        metricsAndKeyChanges: undefined,
      };
    }

    const document = currentWiki.document;
    return {
      currentTopic: document.currentTopic,
      perspectiveMap: [...document.perspectiveMap],
      bookGrounding: [...document.bookGrounding],
      issueAndQuestionMap: [...document.issueAndQuestionMap],
      coverage: [...document.coverage],
      participantState: [...document.participantState],
      metricsAndKeyChanges: document.metricsAndKeyChanges,
    };
  }

  private applyOperation(
    draft: LivingWikiDraft,
    operation: LivingWikiPatchOperationV1,
    operationIndex: number,
  ): void {
    switch (operation.operation) {
      case "SET_CURRENT_TOPIC":
        this.validateTopicTransition(draft.currentTopic, operation.topic, operationIndex);
        draft.currentTopic = operation.topic;
        return;
      case "UPSERT_PERSPECTIVE":
        draft.perspectiveMap = this.upsert(
          draft.perspectiveMap,
          operation.perspective,
          (item) => item.perspectiveId,
        );
        return;
      case "REMOVE_PERSPECTIVE":
        draft.perspectiveMap = this.removeExisting(
          draft.perspectiveMap,
          operation.perspectiveId,
          (item) => item.perspectiveId,
          operationIndex,
        );
        return;
      case "UPSERT_BOOK_GROUNDING":
        draft.bookGrounding = this.upsert(
          draft.bookGrounding,
          operation.grounding,
          (item) => item.groundingId,
        );
        return;
      case "REMOVE_BOOK_GROUNDING":
        draft.bookGrounding = this.removeExisting(
          draft.bookGrounding,
          operation.groundingId,
          (item) => item.groundingId,
          operationIndex,
        );
        return;
      case "UPSERT_ISSUE_OR_QUESTION":
        draft.issueAndQuestionMap = this.upsert(
          draft.issueAndQuestionMap,
          operation.issueOrQuestion,
          (item) => item.issueOrQuestionId,
        );
        return;
      case "UPDATE_COVERAGE":
        draft.coverage = this.upsert(
          draft.coverage,
          operation.coverage,
          (item) => `${item.subjectType}:${item.subjectId}`,
        );
        return;
      case "UPSERT_PUBLIC_PARTICIPANT_STATE":
        draft.participantState = this.upsert(
          draft.participantState,
          operation.participantState,
          (item) => item.participantId,
        );
        return;
      case "SET_METRICS_AND_KEY_CHANGES":
        draft.metricsAndKeyChanges = operation.metricsAndKeyChanges;
    }
  }

  private validateTopicTransition(
    currentTopic: LivingWikiDocumentV1["currentTopic"],
    nextTopic: NonNullable<LivingWikiDocumentV1["currentTopic"]>,
    operationIndex: number,
  ): void {
    if (currentTopic === null && nextTopic.transitionedFromTopicId !== null) {
      this.fail("LIVING_WIKI_TOPIC_TRANSITION_INVALID", operationIndex);
    }
    if (
      currentTopic !== null &&
      currentTopic.topicId !== nextTopic.topicId &&
      nextTopic.transitionedFromTopicId !== currentTopic.topicId
    ) {
      this.fail("LIVING_WIKI_TOPIC_TRANSITION_INVALID", operationIndex);
    }
  }

  private validateRelations(draft: LivingWikiDraft): void {
    const perspectiveIds = new Set(
      draft.perspectiveMap.map((item) => item.perspectiveId),
    );
    const issueIds = new Set(
      draft.issueAndQuestionMap.map((item) => item.issueOrQuestionId),
    );

    for (const perspective of draft.perspectiveMap) {
      if (
        perspective.relations.some(
          (relation) =>
            relation.targetPerspectiveId === perspective.perspectiveId ||
            !perspectiveIds.has(relation.targetPerspectiveId),
        )
      ) {
        this.fail("LIVING_WIKI_RELATION_INVALID");
      }
    }
    if (
      draft.bookGrounding.some((grounding) =>
        grounding.connectedPerspectiveIds.some(
          (perspectiveId) => !perspectiveIds.has(perspectiveId),
        ),
      )
    ) {
      this.fail("LIVING_WIKI_RELATION_INVALID");
    }
    if (
      draft.issueAndQuestionMap.some((issue) =>
        issue.relatedPerspectiveIds.some(
          (perspectiveId) => !perspectiveIds.has(perspectiveId),
        ),
      )
    ) {
      this.fail("LIVING_WIKI_RELATION_INVALID");
    }
    for (const coverage of draft.coverage) {
      const valid =
        coverage.subjectType === "TOPIC" ||
        (coverage.subjectType === "PERSPECTIVE" &&
          perspectiveIds.has(coverage.subjectId)) ||
        (coverage.subjectType === "ISSUE_OR_QUESTION" &&
          issueIds.has(coverage.subjectId));
      if (!valid) this.fail("LIVING_WIKI_RELATION_INVALID");
    }
  }

  private async validateEvidence(
    scope: PublicEvidenceScope,
    references: readonly PublicEvidenceRef[],
  ): Promise<void> {
    const uniqueReferences = new Map<string, PublicEvidenceRef>();
    for (const reference of references) {
      uniqueReferences.set(publicEvidenceRefKey(reference), reference);
    }
    const values = [...uniqueReferences.values()];

    for (
      let index = 0;
      index < values.length;
      index += EVIDENCE_RESOLUTION_BATCH_SIZE
    ) {
      const batch = values.slice(
        index,
        index + EVIDENCE_RESOLUTION_BATCH_SIZE,
      );
      let resolved: readonly ResolvedPublicEvidence[];
      try {
        resolved = await this.evidenceResolver.resolve(scope, batch);
      } catch (error) {
        this.fail(
          "LIVING_WIKI_REFERENCE_INVALID",
          null,
          error instanceof PublicEvidenceResolutionError ? error.code : null,
        );
      }

      const resolvedKeys = new Set(
        resolved.map((item) => publicEvidenceRefKey(item.reference)),
      );
      if (
        resolved.length !== batch.length ||
        batch.some(
          (reference) => !resolvedKeys.has(publicEvidenceRefKey(reference)),
        )
      ) {
        this.fail(
          "LIVING_WIKI_REFERENCE_INVALID",
          null,
          "PUBLIC_EVIDENCE_RESULT_INCOMPLETE",
        );
      }
    }
  }

  private upsert<T>(
    items: readonly T[],
    next: T,
    key: (item: T) => string,
  ): T[] {
    const targetKey = key(next);
    const index = items.findIndex((item) => key(item) === targetKey);
    if (index < 0) return [...items, next];
    return items.map((item, itemIndex) => (itemIndex === index ? next : item));
  }

  private removeExisting<T>(
    items: readonly T[],
    targetKey: string,
    key: (item: T) => string,
    operationIndex: number,
  ): T[] {
    if (!items.some((item) => key(item) === targetKey)) {
      this.fail("LIVING_WIKI_REMOVE_TARGET_NOT_FOUND", operationIndex);
    }
    return items.filter((item) => key(item) !== targetKey);
  }

  private fail(
    code: string,
    operationIndex: number | null = null,
    causeCode: string | null = null,
  ): never {
    throw new LivingWikiPatchError(code, operationIndex, causeCode);
  }
}
