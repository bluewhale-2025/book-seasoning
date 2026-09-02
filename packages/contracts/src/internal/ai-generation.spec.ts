import { describe, expect, it } from "vitest";

import { BookContextDocumentV1Fixture } from "./book-context.fixture.js";
import {
  HostContextV1Schema,
  OpeningContextV1Schema,
} from "./ai-generation.js";
import {
  HostInterventionOutputV1Fixture,
  PolicyInterventionDecisionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
} from "./ai-engine.fixture.js";

describe("public generation contexts", () => {
  it("keeps Opening input anonymous and PUBLIC-only", () => {
    const result = OpeningContextV1Schema.parse({
      schemaVersion: "opening-context.v1",
      session: {
        sessionId: "90000000-0000-4000-8000-000000000001",
        roomId: "b6000000-0000-4000-8000-000000000001",
        pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
        phase: "OPENING",
        phaseVersion: 1,
        basedThroughSeq: 0,
      },
      publicPrep: [
        {
          prepAnswerId: "b7000000-0000-4000-8000-000000000001",
          promptType: "DISCUSSION_QUESTION",
          body: "서로 다른 해석이 생기는 이유를 이야기해보고 싶어요.",
        },
      ],
      bookContext: BookContextDocumentV1Fixture,
    });

    expect(JSON.stringify(result)).not.toContain("authorProfileName");
    expect(JSON.stringify(result)).not.toContain("AI_PRIVATE");
  });

  it("rejects a Host context whose policy cursor does not match", () => {
    expect(() =>
      HostContextV1Schema.parse({
        schemaVersion: "host-context.v1",
        session: {
          sessionId: "90000000-0000-4000-8000-000000000001",
          roomId: "b6000000-0000-4000-8000-000000000001",
          pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
          phase: "CORE",
          phaseVersion: 2,
          basedThroughSeq: 5,
        },
        policy: PolicyInterventionDecisionV1Fixture,
        discussionState: {
          summary: PublicEvaluatorOutputV1Fixture.summaryState,
          currentTopic: PublicEvaluatorOutputV1Fixture.currentTopic,
          majorPerspectives: PublicEvaluatorOutputV1Fixture.majorPerspectives,
          bookGrounding: PublicEvaluatorOutputV1Fixture.bookGrounding,
          openIssues: [],
        },
        messages: [],
        bookContext: BookContextDocumentV1Fixture,
        allowedEvidenceRefs:
          HostInterventionOutputV1Fixture.supportingEvidenceRefs,
      }),
    ).toThrow();
  });
});
