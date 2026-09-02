import { z } from "zod";

import {
  PolicyActionSchema,
  PublicEvidenceRefsSchema,
} from "./ai-common.js";

export const PolicyDecisionSchemaVersionSchema = z.literal(
  "policy-decision.v1",
);

export const PolicyTriggerSchema = z.enum([
  "MESSAGE_BATCH",
  "PARTICIPATION_THRESHOLD",
  "SILENCE",
  "TOPIC_DURATION",
  "EXTENSION_DECISION",
  "HOST_HELP",
]);

export const HostHelpReasonSchema = z.enum([
  "CONVERSATION_STOPPED",
  "DISCUSSION_STUCK_OR_REPETITIVE",
  "TOO_FAR_OFF_TOPIC",
  "CONFLICT_NEEDS_REFRAMING",
]);

export const PolicyReasonCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/);

/**
 * A decision contains exactly one action. WAIT is an explicit successful
 * outcome, not an absent value or an error.
 */
export const PolicyDecisionV1Schema = z
  .strictObject({
    schemaVersion: PolicyDecisionSchemaVersionSchema,
    evaluationId: z.uuid(),
    evaluationTargetThroughSeq: z.int().nonnegative(),
    wikiVersion: z.int().positive(),
    trigger: PolicyTriggerSchema,
    hostHelpReason: HostHelpReasonSchema.nullable(),
    action: PolicyActionSchema,
    reasonCodes: z.array(PolicyReasonCodeSchema).min(1).max(4),
    supportingEvidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((decision, context) => {
    if (decision.trigger === "HOST_HELP" && decision.hostHelpReason === null) {
      context.addIssue({
        code: "custom",
        message: "host help decisions require a selected reason",
        path: ["hostHelpReason"],
      });
    }
    if (decision.trigger !== "HOST_HELP" && decision.hostHelpReason !== null) {
      context.addIssue({
        code: "custom",
        message: "only host help decisions can carry a host help reason",
        path: ["hostHelpReason"],
      });
    }
    if (decision.trigger === "HOST_HELP" && decision.action === "WAIT") {
      context.addIssue({
        code: "custom",
        message: "an accepted host help request must produce one intervention goal",
        path: ["action"],
      });
    }

    for (const [index, reference] of
      decision.supportingEvidenceRefs.entries()) {
      if (
        (reference.type === "MESSAGE" ||
          reference.type === "AI_INTERVENTION") &&
        reference.seqNo > decision.evaluationTargetThroughSeq
      ) {
        context.addIssue({
          code: "custom",
          message: "policy evidence cannot be newer than its evaluation",
          path: ["supportingEvidenceRefs", index, "seqNo"],
        });
      }
    }
  });

export type PolicyTrigger = z.infer<typeof PolicyTriggerSchema>;
export type HostHelpReason = z.infer<typeof HostHelpReasonSchema>;
export type PolicyDecisionV1 = z.infer<typeof PolicyDecisionV1Schema>;
