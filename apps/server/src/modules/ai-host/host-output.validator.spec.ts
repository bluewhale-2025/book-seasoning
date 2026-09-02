import { describe, expect, it } from "vitest";

import {
  AiPrivateCanaryTokenFixture,
  HostInterventionOutputV1Fixture,
  LivingWikiVersionV1Fixture,
  PolicyInterventionDecisionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type { PublicEvidenceResolver } from "../ai-context/public-evidence-reference.resolver.js";
import {
  evaluatorContext,
} from "../public-evaluator/public-evaluator.fixture.js";
import { HostContextBuilder } from "./host-context.builder.js";
import { HostOutputValidator } from "./host-output.validator.js";
import type { HostOutputValidationError } from "./host-output.validator.js";
import {
  PublicAiOutputSafetyError,
  PublicAiOutputSafetyValidator,
} from "./public-ai-output-safety.validator.js";

const resolver = {
  resolve: (_scope: unknown, references: readonly PublicEvidenceRef[]) =>
    Promise.resolve(
      references.map((reference) => ({ reference })) as never,
    ),
} as PublicEvidenceResolver;

const context = new HostContextBuilder().build({
  publicContext: evaluatorContext,
  evaluation: PublicEvaluatorOutputV1Fixture,
  committedWiki: LivingWikiVersionV1Fixture.document,
  policy: PolicyInterventionDecisionV1Fixture,
});

describe("Host output boundary", () => {
  const subject = new HostOutputValidator(
    resolver,
    new PublicAiOutputSafetyValidator(),
  );

  it("accepts one matching action with only allow-listed public evidence", async () => {
    await expect(
      subject.validate(context, HostInterventionOutputV1Fixture),
    ).resolves.toEqual(HostInterventionOutputV1Fixture);
  });

  it("rejects evidence that was not actually sent to Host", async () => {
    await expect(
      subject.validate(context, {
        ...HostInterventionOutputV1Fixture,
        supportingEvidenceRefs: [
          {
            type: "MESSAGE",
            messageId: "91000000-0000-4000-8000-000000000099",
            seqNo: 4,
          },
        ],
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "HOST_REFERENCE_NOT_IN_CONTEXT",
      } satisfies Partial<HostOutputValidationError>),
    );
  });

  it("rejects private canaries and internal metric language", async () => {
    await expect(
      subject.validate(context, {
        ...HostInterventionOutputV1Fixture,
        message: AiPrivateCanaryTokenFixture,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: "HOST_OUTPUT_INVALID" }),
    );
    await expect(
      subject.validate(context, {
        ...HostInterventionOutputV1Fixture,
        message: "내부 점수를 보면 지금은 질문을 더 깊게 해야 합니다.",
      }),
    ).rejects.toBeInstanceOf(PublicAiOutputSafetyError);
  });

  it("rejects direct participant-name targeting without a Policy target", async () => {
    await expect(
      subject.validate(context, {
        ...HostInterventionOutputV1Fixture,
        message: "참가자 님이 먼저 근거를 더 말해주시겠어요?",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PUBLIC_AI_PARTICIPANT_TARGETING_FORBIDDEN",
      } satisfies Partial<PublicAiOutputSafetyError>),
    );
  });
});
