import { z } from "zod";

import {
  PolicyActionSchema,
  PublicAiLabelSchema,
  PublicAiLongTextSchema,
  PublicAiPrepTextSchema,
  PublicEvidenceRefsSchema,
} from "./ai-common.js";
import type {
  AiInterventionEvidenceRefSchema,
  MessageEvidenceRefSchema,
  PublicPrepEvidenceRefSchema,
} from "./ai-common.js";
import { BookContextDocumentV1Schema } from "./book-context.js";
import { LivingWikiVersionV1Schema } from "./living-wiki.js";

const PublicContextTimestampSchema = z.iso.datetime({ offset: true });

export const PublicContextSchemaVersionSchema = z.literal("public-context.v1");

export const PublicContextSessionPhaseSchema = z.enum([
  "SCHEDULED",
  "OPENING",
  "CORE",
  "EXTENDED",
  "SYNTHESIS",
  "CLOSING",
  "ENDED",
  "CANCELED",
]);

export const PublicRawMessageV1Schema = z.strictObject({
  visibility: z.literal("PUBLIC"),
  messageId: z.uuid(),
  sessionId: z.uuid(),
  seqNo: z.int().positive(),
  kind: z.enum(["PARTICIPANT", "AI_HOST"]),
  authorParticipantId: z.uuid().nullable(),
  authorProfileName: PublicAiLabelSchema,
  body: PublicAiLongTextSchema,
  reply: z
    .strictObject({
      messageId: z.uuid(),
      authorProfileName: PublicAiLabelSchema,
      quote: PublicAiLongTextSchema,
    })
    .nullable(),
  confirmedAt: PublicContextTimestampSchema,
  redactedAt: PublicContextTimestampSchema.nullable(),
});

export const PublicPrepAnswerV1Schema = z.strictObject({
  visibility: z.literal("PUBLIC"),
  prepAnswerId: z.uuid(),
  roomId: z.uuid(),
  authorParticipantId: z.uuid(),
  authorProfileName: PublicAiLabelSchema,
  promptType: z.enum([
    "QUOTE_THOUGHT",
    "IMPRESSIVE_PART",
    "DISCUSSION_QUESTION",
  ]),
  body: PublicAiPrepTextSchema,
  revision: z.int().positive(),
  updatedAt: PublicContextTimestampSchema,
});

export const PublicParticipantFactV1Schema = z.strictObject({
  participantId: z.uuid(),
  profileName: PublicAiLabelSchema,
  role: z.enum(["HOST", "PARTICIPANT"]),
  membershipStatus: z.enum([
    "REGISTERED",
    "PARTICIPATED",
    "CANCELED",
    "REMOVED",
    "NO_SHOW",
  ]),
  joinedAt: PublicContextTimestampSchema,
  participatedAt: PublicContextTimestampSchema.nullable(),
  connectionStatus: z.enum(["ONLINE", "OFFLINE"]),
  lastSeenAt: PublicContextTimestampSchema.nullable(),
  messageCountThroughCursor: z.int().nonnegative(),
  lastMessageSeq: z.int().positive().nullable(),
  lastSpokeAt: PublicContextTimestampSchema.nullable(),
});

export const PublicObjectiveSessionMetricsV1Schema = z.strictObject({
  registeredParticipantCount: z.int().nonnegative().max(15),
  actualParticipantCount: z.int().nonnegative().max(15),
  connectedParticipantCount: z.int().nonnegative().max(15),
  recentSpeakerCount: z.int().nonnegative().max(15),
  recentSpeakerWindowSeconds: z.literal(300),
  lastParticipantMessageAt: PublicContextTimestampSchema.nullable(),
  silenceSeconds: z.int().nonnegative(),
});

export const PublicContextSessionV1Schema = z.strictObject({
  sessionId: z.uuid(),
  roomId: z.uuid(),
  pinnedPackVersionId: z.uuid(),
  phase: PublicContextSessionPhaseSchema,
  phaseVersion: z.int().nonnegative(),
  aggregateVersion: z.int().nonnegative(),
  targetThroughSeq: z.int().nonnegative(),
  latestMessageSeq: z.int().nonnegative(),
  startedAt: PublicContextTimestampSchema.nullable(),
  discussionEndsAt: PublicContextTimestampSchema.nullable(),
  extensionPromptedAt: PublicContextTimestampSchema.nullable(),
  extensionDecisionDeadlineAt: PublicContextTimestampSchema.nullable(),
  closingStartedAt: PublicContextTimestampSchema.nullable(),
  closingEndsAt: PublicContextTimestampSchema.nullable(),
  endedAt: PublicContextTimestampSchema.nullable(),
  extensionCount: z.int().nonnegative(),
});

export const RecentPublicPolicyActionV1Schema = z.strictObject({
  action: PolicyActionSchema,
  reasonCodes: z
    .array(z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/))
    .min(1)
    .max(4),
  supportingEvidenceRefs: PublicEvidenceRefsSchema,
  createdAt: PublicContextTimestampSchema,
});

export const PublicContextFrameV1Schema = z.strictObject({
  builtAt: PublicContextTimestampSchema,
  session: PublicContextSessionV1Schema,
  baseWiki: LivingWikiVersionV1Schema.nullable(),
  participants: z.array(PublicParticipantFactV1Schema).max(15),
  objectiveMetrics: PublicObjectiveSessionMetricsV1Schema,
  recentPolicyAction: RecentPublicPolicyActionV1Schema.nullable(),
  lastCommittedInterventionAt: PublicContextTimestampSchema.nullable(),
});

export const PublicContextV1Schema = z
  .strictObject({
    schemaVersion: PublicContextSchemaVersionSchema,
    builtAt: PublicContextTimestampSchema,
    session: PublicContextSessionV1Schema,
    baseWiki: LivingWikiVersionV1Schema.nullable(),
    messages: z.array(PublicRawMessageV1Schema).max(200),
    publicPrep: z.array(PublicPrepAnswerV1Schema).max(100),
    participants: z.array(PublicParticipantFactV1Schema).max(15),
    objectiveMetrics: PublicObjectiveSessionMetricsV1Schema,
    recentPolicyAction: RecentPublicPolicyActionV1Schema.nullable(),
    lastCommittedInterventionAt: PublicContextTimestampSchema.nullable(),
    bookContext: BookContextDocumentV1Schema,
  })
  .superRefine((contextValue, context) => {
    const session = contextValue.session;
    if (session.targetThroughSeq > session.latestMessageSeq) {
      context.addIssue({
        code: "custom",
        message: "target cursor cannot be newer than committed Raw Data",
        path: ["session", "targetThroughSeq"],
      });
    }
    if (
      contextValue.bookContext.packVersionId !== session.pinnedPackVersionId
    ) {
      context.addIssue({
        code: "custom",
        message: "Book Context must be the room-pinned exact Pack version",
        path: ["bookContext", "packVersionId"],
      });
    }
    if (
      contextValue.baseWiki !== null &&
      (contextValue.baseWiki.sessionId !== session.sessionId ||
        contextValue.baseWiki.basedThroughSeq > session.targetThroughSeq)
    ) {
      context.addIssue({
        code: "custom",
        message: "base Wiki must belong to the session and precede the cursor",
        path: ["baseWiki"],
      });
    }

    const messageIds = new Set<string>();
    let previousSeq = 0;
    for (const [index, message] of contextValue.messages.entries()) {
      if (
        message.sessionId !== session.sessionId ||
        message.seqNo > session.targetThroughSeq ||
        message.seqNo <= previousSeq ||
        messageIds.has(message.messageId)
      ) {
        context.addIssue({
          code: "custom",
          message: "messages must be unique ordered Raw Data inside the cursor",
          path: ["messages", index],
        });
      }
      messageIds.add(message.messageId);
      previousSeq = message.seqNo;
    }

    const prepIds = new Set<string>();
    for (const [index, prep] of contextValue.publicPrep.entries()) {
      if (prep.roomId !== session.roomId || prepIds.has(prep.prepAnswerId)) {
        context.addIssue({
          code: "custom",
          message: "PUBLIC prep must belong to the session room and be unique",
          path: ["publicPrep", index],
        });
      }
      prepIds.add(prep.prepAnswerId);
    }

    const participantIds = new Set<string>();
    for (const [index, participant] of contextValue.participants.entries()) {
      if (participantIds.has(participant.participantId)) {
        context.addIssue({
          code: "custom",
          message: "participant facts must be unique",
          path: ["participants", index, "participantId"],
        });
      }
      participantIds.add(participant.participantId);
    }
  });

export type PublicRawMessageV1 = z.infer<typeof PublicRawMessageV1Schema>;
export type PublicPrepAnswerV1 = z.infer<typeof PublicPrepAnswerV1Schema>;
export type PublicContextFrameV1 = z.infer<typeof PublicContextFrameV1Schema>;
export type PublicContextV1 = z.infer<typeof PublicContextV1Schema>;
export type MessageEvidenceRef = z.infer<typeof MessageEvidenceRefSchema>;
export type PublicPrepEvidenceRef = z.infer<
  typeof PublicPrepEvidenceRefSchema
>;
export type AiInterventionEvidenceRef = z.infer<
  typeof AiInterventionEvidenceRefSchema
>;
