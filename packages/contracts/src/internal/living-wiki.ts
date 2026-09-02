import { z } from "zod";

import {
  BookContextItemEvidenceRefSchema,
  DiscussionMetricsV1Schema,
  PublicAiLabelSchema,
  PublicAiShortTextSchema,
  PublicEvidenceRefsSchema,
  RequiredPublicEvidenceRefsSchema,
  type PublicEvidenceRef,
} from "./ai-common.js";

export const LivingWikiSchemaVersionSchema = z.literal("living-wiki.v1");
export const LivingWikiPatchSchemaVersionSchema = z.literal(
  "living-wiki-patch.v1",
);

export const LivingWikiVersionKindSchema = z.enum([
  "INCREMENTAL",
  "TOPIC_CHECKPOINT",
  "FINAL",
]);

export const LivingWikiCurrentTopicSchema = z
  .strictObject({
    topicId: z.uuid(),
    title: PublicAiLabelSchema,
    guidingQuestion: PublicAiShortTextSchema.nullable(),
    transitionedFromTopicId: z.uuid().nullable(),
    changeSummary: PublicAiShortTextSchema.nullable(),
    evidenceRefs: RequiredPublicEvidenceRefsSchema,
  })
  .superRefine((topic, context) => {
    if (
      (topic.transitionedFromTopicId === null) !==
      (topic.changeSummary === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "topic transition identity and summary must appear together",
        path: ["changeSummary"],
      });
    }
    if (topic.transitionedFromTopicId === topic.topicId) {
      context.addIssue({
        code: "custom",
        message: "a topic cannot transition from itself",
        path: ["transitionedFromTopicId"],
      });
    }
  });

export const LivingWikiPerspectiveRelationSchema = z.strictObject({
  targetPerspectiveId: z.uuid(),
  relation: z.enum(["CONFLICTS_WITH", "COMPLEMENTS", "EXTENDS"]),
  evidenceRefs: RequiredPublicEvidenceRefsSchema,
});

export const LivingWikiPerspectiveSchema = z
  .strictObject({
    perspectiveId: z.uuid(),
    summary: PublicAiShortTextSchema,
    evidenceRefs: RequiredPublicEvidenceRefsSchema,
    relations: z.array(LivingWikiPerspectiveRelationSchema).max(20),
  })
  .superRefine((perspective, context) => {
    const targets = new Set<string>();
    for (const [index, relation] of perspective.relations.entries()) {
      if (targets.has(relation.targetPerspectiveId)) {
        context.addIssue({
          code: "custom",
          message: "a perspective relation target must be unique",
          path: ["relations", index, "targetPerspectiveId"],
        });
      }
      targets.add(relation.targetPerspectiveId);
    }
  });

export const LivingWikiBookGroundingSchema = z
  .strictObject({
    groundingId: z.uuid(),
    summary: PublicAiShortTextSchema,
    bookContextItemRef: BookContextItemEvidenceRefSchema,
    evidenceRefs: RequiredPublicEvidenceRefsSchema,
    connectedPerspectiveIds: z.array(z.uuid()).max(20),
  })
  .superRefine((grounding, context) => {
    const connected = new Set<string>();
    for (const [index, perspectiveId] of
      grounding.connectedPerspectiveIds.entries()) {
      if (connected.has(perspectiveId)) {
        context.addIssue({
          code: "custom",
          message: "connected perspective identifiers must be unique",
          path: ["connectedPerspectiveIds", index],
        });
      }
      connected.add(perspectiveId);
    }
  });

export const LivingWikiIssueOrQuestionSchema = z
  .strictObject({
    issueOrQuestionId: z.uuid(),
    kind: z.enum(["ISSUE", "OPEN_QUESTION"]),
    text: PublicAiShortTextSchema,
    status: z.enum(["OPEN", "ACTIVE", "COVERED"]),
    evidenceRefs: RequiredPublicEvidenceRefsSchema,
    relatedPerspectiveIds: z.array(z.uuid()).max(20),
  })
  .superRefine((issue, context) => {
    const related = new Set<string>();
    for (const [index, perspectiveId] of issue.relatedPerspectiveIds.entries()) {
      if (related.has(perspectiveId)) {
        context.addIssue({
          code: "custom",
          message: "related perspective identifiers must be unique",
          path: ["relatedPerspectiveIds", index],
        });
      }
      related.add(perspectiveId);
    }
  });

export const LivingWikiCoverageSchema = z.strictObject({
  subjectType: z.enum(["TOPIC", "PERSPECTIVE", "ISSUE_OR_QUESTION"]),
  subjectId: z.uuid(),
  level: z.enum(["UNEXPLORED", "PARTIAL", "EXPLORED"]),
  rationale: PublicAiShortTextSchema,
  evidenceRefs: RequiredPublicEvidenceRefsSchema,
});

export const LivingWikiPublicParticipantStateSchema = z
  .strictObject({
    participantId: z.uuid(),
    attendance: z.enum(["PRESENT", "LEFT"]),
    recentActivity: z.enum(["ACTIVE", "QUIET", "OFFLINE"]),
    publiclyExpressedPosition: PublicAiShortTextSchema.nullable(),
    evidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((state, context) => {
    if (
      state.publiclyExpressedPosition !== null &&
      state.evidenceRefs.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "a publicly expressed position requires public evidence",
        path: ["evidenceRefs"],
      });
    }
  });

export const LivingWikiKeyChangeSchema = z.strictObject({
  changeId: z.uuid(),
  description: PublicAiShortTextSchema,
  evidenceRefs: RequiredPublicEvidenceRefsSchema,
});

export const LivingWikiMetricsAndKeyChangesSchema = z.strictObject({
  metrics: DiscussionMetricsV1Schema,
  summary: PublicAiShortTextSchema,
  keyChanges: z.array(LivingWikiKeyChangeSchema).max(30),
});

const addDuplicateIdIssues = (
  values: readonly string[],
  context: z.RefinementCtx,
  path: string,
): void => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: `${path} identifiers must be unique`,
        path: [path, index],
      });
    }
    seen.add(value);
  }
};

export const LivingWikiDocumentV1Schema = z
  .strictObject({
    currentTopic: LivingWikiCurrentTopicSchema.nullable(),
    perspectiveMap: z.array(LivingWikiPerspectiveSchema).max(50),
    bookGrounding: z.array(LivingWikiBookGroundingSchema).max(50),
    issueAndQuestionMap: z.array(LivingWikiIssueOrQuestionSchema).max(50),
    coverage: z.array(LivingWikiCoverageSchema).max(100),
    participantState: z.array(LivingWikiPublicParticipantStateSchema).max(15),
    metricsAndKeyChanges: LivingWikiMetricsAndKeyChangesSchema,
  })
  .superRefine((document, context) => {
    const perspectiveIds = document.perspectiveMap.map(
      (perspective) => perspective.perspectiveId,
    );
    const issueIds = document.issueAndQuestionMap.map(
      (issue) => issue.issueOrQuestionId,
    );
    const perspectiveIdSet = new Set(perspectiveIds);
    const issueIdSet = new Set(issueIds);

    addDuplicateIdIssues(perspectiveIds, context, "perspectiveMap");
    addDuplicateIdIssues(
      document.bookGrounding.map((grounding) => grounding.groundingId),
      context,
      "bookGrounding",
    );
    addDuplicateIdIssues(issueIds, context, "issueAndQuestionMap");
    addDuplicateIdIssues(
      document.participantState.map((state) => state.participantId),
      context,
      "participantState",
    );
    addDuplicateIdIssues(
      document.metricsAndKeyChanges.keyChanges.map((change) => change.changeId),
      context,
      "metricsAndKeyChanges.keyChanges",
    );
    addDuplicateIdIssues(
      document.coverage.map(
        (coverage) => `${coverage.subjectType}:${coverage.subjectId}`,
      ),
      context,
      "coverage",
    );

    for (const [perspectiveIndex, perspective] of document.perspectiveMap.entries()) {
      for (const [relationIndex, relation] of perspective.relations.entries()) {
        if (!perspectiveIdSet.has(relation.targetPerspectiveId)) {
          context.addIssue({
            code: "custom",
            message: "perspective relation target must exist in the document",
            path: [
              "perspectiveMap",
              perspectiveIndex,
              "relations",
              relationIndex,
              "targetPerspectiveId",
            ],
          });
        }
        if (relation.targetPerspectiveId === perspective.perspectiveId) {
          context.addIssue({
            code: "custom",
            message: "a perspective cannot relate to itself",
            path: [
              "perspectiveMap",
              perspectiveIndex,
              "relations",
              relationIndex,
              "targetPerspectiveId",
            ],
          });
        }
      }
    }

    for (const [groundingIndex, grounding] of document.bookGrounding.entries()) {
      for (const [connectionIndex, perspectiveId] of
        grounding.connectedPerspectiveIds.entries()) {
        if (!perspectiveIdSet.has(perspectiveId)) {
          context.addIssue({
            code: "custom",
            message: "book grounding must connect to an existing perspective",
            path: [
              "bookGrounding",
              groundingIndex,
              "connectedPerspectiveIds",
              connectionIndex,
            ],
          });
        }
      }
    }

    for (const [issueIndex, issue] of document.issueAndQuestionMap.entries()) {
      for (const [relationIndex, perspectiveId] of
        issue.relatedPerspectiveIds.entries()) {
        if (!perspectiveIdSet.has(perspectiveId)) {
          context.addIssue({
            code: "custom",
            message: "issue must relate to an existing perspective",
            path: [
              "issueAndQuestionMap",
              issueIndex,
              "relatedPerspectiveIds",
              relationIndex,
            ],
          });
        }
      }
    }

    for (const [coverageIndex, coverage] of document.coverage.entries()) {
      // TOPIC coverage may point to a historical stable topic id. Topic
      // checkpoints retain that coverage after currentTopic moves forward.
      if (
        coverage.subjectType === "PERSPECTIVE" &&
        !perspectiveIdSet.has(coverage.subjectId)
      ) {
        context.addIssue({
          code: "custom",
          message: "coverage perspective must exist in the document",
          path: ["coverage", coverageIndex, "subjectId"],
        });
      }
      if (
        coverage.subjectType === "ISSUE_OR_QUESTION" &&
        !issueIdSet.has(coverage.subjectId)
      ) {
        context.addIssue({
          code: "custom",
          message: "coverage issue must exist in the document",
          path: ["coverage", coverageIndex, "subjectId"],
        });
      }
    }
  });

const PatchOperationBaseSchema = z.strictObject({
  baseVersion: z.int().nonnegative(),
});

const SetCurrentTopicOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("SET_CURRENT_TOPIC"),
  topic: LivingWikiCurrentTopicSchema,
});

const UpsertPerspectiveOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("UPSERT_PERSPECTIVE"),
  perspective: LivingWikiPerspectiveSchema,
});

const RemovePerspectiveOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("REMOVE_PERSPECTIVE"),
  perspectiveId: z.uuid(),
  evidenceRefs: RequiredPublicEvidenceRefsSchema,
});

const UpsertBookGroundingOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("UPSERT_BOOK_GROUNDING"),
  grounding: LivingWikiBookGroundingSchema,
});

const RemoveBookGroundingOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("REMOVE_BOOK_GROUNDING"),
  groundingId: z.uuid(),
  evidenceRefs: RequiredPublicEvidenceRefsSchema,
});

const UpsertIssueOrQuestionOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("UPSERT_ISSUE_OR_QUESTION"),
  issueOrQuestion: LivingWikiIssueOrQuestionSchema,
});

const UpdateCoverageOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("UPDATE_COVERAGE"),
  coverage: LivingWikiCoverageSchema,
});

const UpsertPublicParticipantStateOperationSchema =
  PatchOperationBaseSchema.extend({
    operation: z.literal("UPSERT_PUBLIC_PARTICIPANT_STATE"),
    participantState: LivingWikiPublicParticipantStateSchema,
  });

const SetMetricsAndKeyChangesOperationSchema = PatchOperationBaseSchema.extend({
  operation: z.literal("SET_METRICS_AND_KEY_CHANGES"),
  metricsAndKeyChanges: LivingWikiMetricsAndKeyChangesSchema,
});

export const LivingWikiPatchOperationV1Schema = z.discriminatedUnion(
  "operation",
  [
    SetCurrentTopicOperationSchema,
    UpsertPerspectiveOperationSchema,
    RemovePerspectiveOperationSchema,
    UpsertBookGroundingOperationSchema,
    RemoveBookGroundingOperationSchema,
    UpsertIssueOrQuestionOperationSchema,
    UpdateCoverageOperationSchema,
    UpsertPublicParticipantStateOperationSchema,
    SetMetricsAndKeyChangesOperationSchema,
  ],
);

export type LivingWikiPatchOperationV1 = z.infer<
  typeof LivingWikiPatchOperationV1Schema
>;

const operationEvidenceRefs = (
  operation: LivingWikiPatchOperationV1,
): PublicEvidenceRef[] => {
  switch (operation.operation) {
    case "SET_CURRENT_TOPIC":
      return operation.topic.evidenceRefs;
    case "UPSERT_PERSPECTIVE":
      return [
        ...operation.perspective.evidenceRefs,
        ...operation.perspective.relations.flatMap(
          (relation) => relation.evidenceRefs,
        ),
      ];
    case "REMOVE_PERSPECTIVE":
    case "REMOVE_BOOK_GROUNDING":
      return operation.evidenceRefs;
    case "UPSERT_BOOK_GROUNDING":
      return [
        operation.grounding.bookContextItemRef,
        ...operation.grounding.evidenceRefs,
      ];
    case "UPSERT_ISSUE_OR_QUESTION":
      return operation.issueOrQuestion.evidenceRefs;
    case "UPDATE_COVERAGE":
      return operation.coverage.evidenceRefs;
    case "UPSERT_PUBLIC_PARTICIPANT_STATE":
      return operation.participantState.evidenceRefs;
    case "SET_METRICS_AND_KEY_CHANGES":
      return [
        ...Object.values(operation.metricsAndKeyChanges.metrics).flatMap(
          (metric) => metric.evidenceRefs,
        ),
        ...operation.metricsAndKeyChanges.keyChanges.flatMap(
          (change) => change.evidenceRefs,
        ),
      ];
  }
};

const operationTargetKey = (operation: LivingWikiPatchOperationV1): string => {
  switch (operation.operation) {
    case "SET_CURRENT_TOPIC":
    case "SET_METRICS_AND_KEY_CHANGES":
      return operation.operation;
    case "UPSERT_PERSPECTIVE":
      return `PERSPECTIVE:${operation.perspective.perspectiveId}`;
    case "REMOVE_PERSPECTIVE":
      return `PERSPECTIVE:${operation.perspectiveId}`;
    case "UPSERT_BOOK_GROUNDING":
      return `BOOK_GROUNDING:${operation.grounding.groundingId}`;
    case "REMOVE_BOOK_GROUNDING":
      return `BOOK_GROUNDING:${operation.groundingId}`;
    case "UPSERT_ISSUE_OR_QUESTION":
      return `ISSUE_OR_QUESTION:${operation.issueOrQuestion.issueOrQuestionId}`;
    case "UPDATE_COVERAGE":
      return `COVERAGE:${operation.coverage.subjectType}:${operation.coverage.subjectId}`;
    case "UPSERT_PUBLIC_PARTICIPANT_STATE":
      return `PARTICIPANT:${operation.participantState.participantId}`;
  }
};

const addCursorIssues = (
  references: readonly PublicEvidenceRef[],
  basedThroughSeq: number,
  context: z.RefinementCtx,
  path: (string | number)[],
): void => {
  for (const [index, reference] of references.entries()) {
    if (
      (reference.type === "MESSAGE" || reference.type === "AI_INTERVENTION") &&
      reference.seqNo > basedThroughSeq
    ) {
      context.addIssue({
        code: "custom",
        message: "evidence reference cannot be newer than basedThroughSeq",
        path: [...path, index, "seqNo"],
      });
    }
  }
};

export const LivingWikiPatchV1Schema = z
  .strictObject({
    schemaVersion: LivingWikiPatchSchemaVersionSchema,
    baseVersion: z.int().nonnegative(),
    basedThroughSeq: z.int().nonnegative(),
    operations: z.array(LivingWikiPatchOperationV1Schema).max(100),
  })
  .superRefine((patch, context) => {
    const targetKeys = new Set<string>();
    for (const [index, operation] of patch.operations.entries()) {
      if (operation.baseVersion !== patch.baseVersion) {
        context.addIssue({
          code: "custom",
          message: "operation baseVersion must match patch baseVersion",
          path: ["operations", index, "baseVersion"],
        });
      }

      const targetKey = operationTargetKey(operation);
      if (targetKeys.has(targetKey)) {
        context.addIssue({
          code: "custom",
          message: "a patch cannot mutate the same target more than once",
          path: ["operations", index],
        });
      }
      targetKeys.add(targetKey);

      addCursorIssues(
        operationEvidenceRefs(operation),
        patch.basedThroughSeq,
        context,
        ["operations", index],
      );
    }
  });

export type LivingWikiDocumentV1 = z.infer<
  typeof LivingWikiDocumentV1Schema
>;

const documentEvidenceRefs = (
  document: LivingWikiDocumentV1,
): PublicEvidenceRef[] => [
  ...(document.currentTopic?.evidenceRefs ?? []),
  ...document.perspectiveMap.flatMap((perspective) => [
    ...perspective.evidenceRefs,
    ...perspective.relations.flatMap((relation) => relation.evidenceRefs),
  ]),
  ...document.bookGrounding.flatMap((grounding) => [
    grounding.bookContextItemRef,
    ...grounding.evidenceRefs,
  ]),
  ...document.issueAndQuestionMap.flatMap((issue) => issue.evidenceRefs),
  ...document.coverage.flatMap((coverage) => coverage.evidenceRefs),
  ...document.participantState.flatMap((state) => state.evidenceRefs),
  ...Object.values(document.metricsAndKeyChanges.metrics).flatMap(
    (metric) => metric.evidenceRefs,
  ),
  ...document.metricsAndKeyChanges.keyChanges.flatMap(
    (change) => change.evidenceRefs,
  ),
];

export const LivingWikiVersionV1Schema = z
  .strictObject({
    sessionId: z.uuid(),
    version: z.int().positive(),
    kind: LivingWikiVersionKindSchema,
    baseVersion: z.int().positive().nullable(),
    basedThroughSeq: z.int().nonnegative(),
    schemaVersion: LivingWikiSchemaVersionSchema,
    document: LivingWikiDocumentV1Schema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((version, context) => {
    if (version.version === 1 && version.baseVersion !== null) {
      context.addIssue({
        code: "custom",
        message: "the first Wiki version cannot have a base version",
        path: ["baseVersion"],
      });
    }
    if (version.version > 1 && version.baseVersion === null) {
      context.addIssue({
        code: "custom",
        message: "subsequent Wiki versions require a base version",
        path: ["baseVersion"],
      });
    }
    if (
      version.baseVersion !== null &&
      version.baseVersion >= version.version
    ) {
      context.addIssue({
        code: "custom",
        message: "baseVersion must precede version",
        path: ["baseVersion"],
      });
    }
    addCursorIssues(
      documentEvidenceRefs(version.document),
      version.basedThroughSeq,
      context,
      ["document"],
    );
  });

export type LivingWikiCurrentTopic = z.infer<
  typeof LivingWikiCurrentTopicSchema
>;
export type LivingWikiPerspective = z.infer<
  typeof LivingWikiPerspectiveSchema
>;
export type LivingWikiBookGrounding = z.infer<
  typeof LivingWikiBookGroundingSchema
>;
export type LivingWikiIssueOrQuestion = z.infer<
  typeof LivingWikiIssueOrQuestionSchema
>;
export type LivingWikiPublicParticipantState = z.infer<
  typeof LivingWikiPublicParticipantStateSchema
>;
export type LivingWikiMetricsAndKeyChanges = z.infer<
  typeof LivingWikiMetricsAndKeyChangesSchema
>;
export type LivingWikiPatchV1 = z.infer<typeof LivingWikiPatchV1Schema>;
export type LivingWikiVersionV1 = z.infer<typeof LivingWikiVersionV1Schema>;
