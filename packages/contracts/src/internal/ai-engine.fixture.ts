import type {
  DiscussionMetricsV1,
  PublicEvidenceRef,
} from "./ai-common.js";
import { AI_PRIVATE_CANARY_PREFIX } from "./ai-common.js";
import type { PublicEvaluatorOutputV1 } from "./ai-evaluator.js";
import type {
  ExtensionRecommendationOutputV1,
  HostInterventionOutputV1,
  OpeningOutputV1,
} from "./ai-host.js";
import type { PolicyDecisionV1 } from "./ai-policy.js";
import type {
  LivingWikiBookGrounding,
  LivingWikiCurrentTopic,
  LivingWikiIssueOrQuestion,
  LivingWikiMetricsAndKeyChanges,
  LivingWikiPatchV1,
  LivingWikiPerspective,
  LivingWikiPublicParticipantState,
  LivingWikiVersionV1,
} from "./living-wiki.js";

export const AiEngineFixtureIds = {
  sessionId: "90000000-0000-4000-8000-000000000001",
  packVersionId: "40000000-0000-4000-8000-000000000002",
  bookContextItemId: "42000000-0000-4000-8000-000000000001",
  participantId: "70000000-0000-4000-8000-000000000001",
  messageId: "91000000-0000-4000-8000-000000000001",
  secondMessageId: "91000000-0000-4000-8000-000000000002",
  topicId: "a0000000-0000-4000-8000-000000000001",
  perspectiveId: "a1000000-0000-4000-8000-000000000001",
  secondPerspectiveId: "a1000000-0000-4000-8000-000000000002",
  groundingId: "a2000000-0000-4000-8000-000000000001",
  issueId: "a3000000-0000-4000-8000-000000000001",
  changeId: "a4000000-0000-4000-8000-000000000001",
  evaluationId: "a5000000-0000-4000-8000-000000000001",
} as const;

export const AiEngineMessageEvidenceFixture = {
  type: "MESSAGE",
  messageId: AiEngineFixtureIds.messageId,
  seqNo: 3,
} satisfies PublicEvidenceRef;

export const AiEngineSecondMessageEvidenceFixture = {
  type: "MESSAGE",
  messageId: AiEngineFixtureIds.secondMessageId,
  seqNo: 4,
} satisfies PublicEvidenceRef;

export const AiEngineBookEvidenceFixture = {
  type: "BOOK_CONTEXT_ITEM",
  packVersionId: AiEngineFixtureIds.packVersionId,
  itemId: AiEngineFixtureIds.bookContextItemId,
} satisfies PublicEvidenceRef;

export const DiscussionMetricsV1Fixture = {
  depth: {
    level: "HIGH",
    reasonCodes: ["REASONS_AND_ASSUMPTIONS_COMPARED"],
    evidenceRefs: [AiEngineMessageEvidenceFixture],
  },
  expansion: {
    level: "HIGH",
    reasonCodes: ["PERSPECTIVES_CONNECTED_AND_CONTRASTED"],
    evidenceRefs: [
      AiEngineMessageEvidenceFixture,
      AiEngineSecondMessageEvidenceFixture,
    ],
  },
  bookGrounding: {
    level: "MEDIUM",
    reasonCodes: ["BOOK_IDEA_REMAINS_ANCHOR"],
    evidenceRefs: [
      AiEngineMessageEvidenceFixture,
      AiEngineBookEvidenceFixture,
    ],
  },
  saturation: {
    level: "LOW",
    reasonCodes: ["NEW_QUESTIONS_STILL_EMERGING"],
    evidenceRefs: [AiEngineSecondMessageEvidenceFixture],
  },
  participationBalance: {
    level: "MEDIUM",
    reasonCodes: ["MULTIPLE_MEANINGFUL_VIEWS_PRESENT"],
    evidenceRefs: [
      AiEngineMessageEvidenceFixture,
      AiEngineSecondMessageEvidenceFixture,
    ],
  },
  relevance: {
    level: "HIGH",
    reasonCodes: ["CURRENT_ISSUE_REMAINS_FOCUSED"],
    evidenceRefs: [AiEngineSecondMessageEvidenceFixture],
  },
  activity: {
    level: "HIGH",
    reasonCodes: ["RESPONSES_ARE_CONTINUING"],
    evidenceRefs: [AiEngineSecondMessageEvidenceFixture],
  },
} satisfies DiscussionMetricsV1;

export const LivingWikiCurrentTopicFixture = {
  topicId: AiEngineFixtureIds.topicId,
  title: "질문이 서로 다른 해석을 만드는 방식",
  guidingQuestion: "같은 질문을 읽고도 왜 서로 다른 전제를 발견하게 될까요?",
  transitionedFromTopicId: null,
  changeSummary: null,
  evidenceRefs: [
    AiEngineMessageEvidenceFixture,
    AiEngineSecondMessageEvidenceFixture,
  ],
} satisfies LivingWikiCurrentTopic;

export const LivingWikiPerspectiveFixtures = [
  {
    perspectiveId: AiEngineFixtureIds.perspectiveId,
    summary: "질문은 이미 알고 있던 생각의 전제를 드러내는 장치라는 관점",
    evidenceRefs: [AiEngineMessageEvidenceFixture],
    relations: [
      {
        targetPerspectiveId: AiEngineFixtureIds.secondPerspectiveId,
        relation: "COMPLEMENTS",
        evidenceRefs: [
          AiEngineMessageEvidenceFixture,
          AiEngineSecondMessageEvidenceFixture,
        ],
      },
    ],
  },
  {
    perspectiveId: AiEngineFixtureIds.secondPerspectiveId,
    summary: "질문은 대화 상대와의 관계 속에서 새 관점을 만드는 장치라는 관점",
    evidenceRefs: [AiEngineSecondMessageEvidenceFixture],
    relations: [
      {
        targetPerspectiveId: AiEngineFixtureIds.perspectiveId,
        relation: "COMPLEMENTS",
        evidenceRefs: [
          AiEngineMessageEvidenceFixture,
          AiEngineSecondMessageEvidenceFixture,
        ],
      },
    ],
  },
] satisfies LivingWikiPerspective[];

export const LivingWikiBookGroundingFixture = {
  groundingId: AiEngineFixtureIds.groundingId,
  summary: "책에서 질문을 결론이 아닌 사고를 여는 장치로 설명한 대목과 연결된다.",
  bookContextItemRef: AiEngineBookEvidenceFixture,
  evidenceRefs: [AiEngineMessageEvidenceFixture, AiEngineBookEvidenceFixture],
  connectedPerspectiveIds: [AiEngineFixtureIds.perspectiveId],
} satisfies LivingWikiBookGrounding;

export const LivingWikiIssueOrQuestionFixture = {
  issueOrQuestionId: AiEngineFixtureIds.issueId,
  kind: "OPEN_QUESTION",
  text: "좋은 질문의 힘은 질문 자체와 관계 중 어디에서 더 크게 생기는가?",
  status: "ACTIVE",
  evidenceRefs: [
    AiEngineMessageEvidenceFixture,
    AiEngineSecondMessageEvidenceFixture,
  ],
  relatedPerspectiveIds: [
    AiEngineFixtureIds.perspectiveId,
    AiEngineFixtureIds.secondPerspectiveId,
  ],
} satisfies LivingWikiIssueOrQuestion;

export const LivingWikiPublicParticipantStateFixture = {
  participantId: AiEngineFixtureIds.participantId,
  attendance: "PRESENT",
  recentActivity: "ACTIVE",
  publiclyExpressedPosition:
    "질문이 자신의 기존 전제를 드러낸다는 관점을 공개 발언으로 제시했다.",
  evidenceRefs: [AiEngineMessageEvidenceFixture],
} satisfies LivingWikiPublicParticipantState;

export const LivingWikiMetricsAndKeyChangesFixture = {
  metrics: DiscussionMetricsV1Fixture,
  summary: "서로 다른 관점이 충돌하지 않고 연결되며 현재 질문이 확장되고 있다.",
  keyChanges: [
    {
      changeId: AiEngineFixtureIds.changeId,
      description: "질문의 개인적 효과에서 관계 속 효과로 공개 논의 범위가 넓어졌다.",
      evidenceRefs: [
        AiEngineMessageEvidenceFixture,
        AiEngineSecondMessageEvidenceFixture,
      ],
    },
  ],
} satisfies LivingWikiMetricsAndKeyChanges;

export const LivingWikiVersionV1Fixture = {
  sessionId: AiEngineFixtureIds.sessionId,
  version: 1,
  kind: "INCREMENTAL",
  baseVersion: null,
  basedThroughSeq: 4,
  schemaVersion: "living-wiki.v1",
  document: {
    currentTopic: LivingWikiCurrentTopicFixture,
    perspectiveMap: LivingWikiPerspectiveFixtures,
    bookGrounding: [LivingWikiBookGroundingFixture],
    issueAndQuestionMap: [LivingWikiIssueOrQuestionFixture],
    coverage: [
      {
        subjectType: "TOPIC",
        subjectId: AiEngineFixtureIds.topicId,
        level: "PARTIAL",
        rationale: "두 관점이 연결됐지만 좋은 질문의 조건은 더 탐색할 수 있다.",
        evidenceRefs: [
          AiEngineMessageEvidenceFixture,
          AiEngineSecondMessageEvidenceFixture,
        ],
      },
    ],
    participantState: [LivingWikiPublicParticipantStateFixture],
    metricsAndKeyChanges: LivingWikiMetricsAndKeyChangesFixture,
  },
  createdAt: "2026-09-02T00:00:00.000Z",
} satisfies LivingWikiVersionV1;

export const LivingWikiPatchV1Fixture = {
  schemaVersion: "living-wiki-patch.v1",
  baseVersion: 1,
  basedThroughSeq: 4,
  operations: [
    {
      operation: "SET_CURRENT_TOPIC",
      baseVersion: 1,
      topic: LivingWikiCurrentTopicFixture,
    },
    ...LivingWikiPerspectiveFixtures.map((perspective) => ({
      operation: "UPSERT_PERSPECTIVE" as const,
      baseVersion: 1,
      perspective,
    })),
    {
      operation: "UPSERT_BOOK_GROUNDING",
      baseVersion: 1,
      grounding: LivingWikiBookGroundingFixture,
    },
    {
      operation: "UPSERT_ISSUE_OR_QUESTION",
      baseVersion: 1,
      issueOrQuestion: LivingWikiIssueOrQuestionFixture,
    },
    {
      operation: "UPDATE_COVERAGE",
      baseVersion: 1,
      coverage: LivingWikiVersionV1Fixture.document.coverage[0]!,
    },
    {
      operation: "UPSERT_PUBLIC_PARTICIPANT_STATE",
      baseVersion: 1,
      participantState: LivingWikiPublicParticipantStateFixture,
    },
    {
      operation: "SET_METRICS_AND_KEY_CHANGES",
      baseVersion: 1,
      metricsAndKeyChanges: LivingWikiMetricsAndKeyChangesFixture,
    },
  ],
} satisfies LivingWikiPatchV1;

export const PublicEvaluatorOutputV1Fixture = {
  schemaVersion: "public-evaluator-output.v1",
  packVersionId: AiEngineFixtureIds.packVersionId,
  baseWikiVersion: 1,
  targetThroughSeq: 4,
  metrics: DiscussionMetricsV1Fixture,
  summaryState: "사람들의 관점이 자연스럽게 연결되고 있어 개입 없이 흐름을 유지할 수 있다.",
  currentTopic: LivingWikiCurrentTopicFixture,
  majorPerspectives: LivingWikiPerspectiveFixtures,
  bookGrounding: [LivingWikiBookGroundingFixture],
  participation: [LivingWikiPublicParticipantStateFixture],
  interventionNeed: "NONE",
  confidence: "HIGH",
  suggestedAction: "WAIT",
  wikiPatch: LivingWikiPatchV1Fixture,
} satisfies PublicEvaluatorOutputV1;

export const PolicyWaitDecisionV1Fixture = {
  schemaVersion: "policy-decision.v1",
  evaluationId: AiEngineFixtureIds.evaluationId,
  evaluationTargetThroughSeq: 4,
  wikiVersion: 2,
  trigger: "MESSAGE_BATCH",
  hostHelpReason: null,
  action: "WAIT",
  reasonCodes: ["GOOD_HUMAN_FLOW"],
  supportingEvidenceRefs: [
    AiEngineMessageEvidenceFixture,
    AiEngineSecondMessageEvidenceFixture,
  ],
} satisfies PolicyDecisionV1;

export const PolicyInterventionDecisionV1Fixture = {
  ...PolicyWaitDecisionV1Fixture,
  trigger: "HOST_HELP",
  hostHelpReason: "DISCUSSION_STUCK_OR_REPETITIVE",
  action: "DEEPEN",
  reasonCodes: ["HOST_HELP_REQUESTED", "DEPTH_CAN_BE_DEVELOPED"],
} satisfies PolicyDecisionV1;

export const HostInterventionOutputV1Fixture = {
  schemaVersion: "host-intervention-output.v1",
  packVersionId: AiEngineFixtureIds.packVersionId,
  basedThroughSeq: 4,
  action: "DEEPEN",
  attribution: "HOST_REQUESTED",
  message:
    "두 관점 모두 질문의 힘을 말하고 있는데요. 그 힘이 질문 자체보다 관계에서 생긴다고 본 근거를 조금 더 풀어볼까요?",
  supportingEvidenceRefs: [
    AiEngineMessageEvidenceFixture,
    AiEngineSecondMessageEvidenceFixture,
  ],
} satisfies HostInterventionOutputV1;

export const OpeningOutputV1Fixture = {
  schemaVersion: "opening-output.v1",
  packVersionId: AiEngineFixtureIds.packVersionId,
  basedThroughSeq: 0,
  message:
    "이 책에서 여러분의 생각을 가장 오래 붙잡아 둔 질문은 무엇이었나요? 서로 다른 장면부터 천천히 꺼내볼까요?",
  supportingEvidenceRefs: [AiEngineBookEvidenceFixture],
} satisfies OpeningOutputV1;

export const ExtensionRecommendationOutputV1Fixture = {
  schemaVersion: "extension-recommendation-output.v1",
  packVersionId: AiEngineFixtureIds.packVersionId,
  basedThroughSeq: 4,
  recommendation: "EXTEND",
  reason: "새 관점이 기존 관점과 연결되고 있어 조금 더 탐색할 가치가 있습니다.",
  supportingEvidenceRefs: [
    AiEngineMessageEvidenceFixture,
    AiEngineSecondMessageEvidenceFixture,
  ],
} satisfies ExtensionRecommendationOutputV1;

export const AiPrivateCanaryTokenFixture =
  `${AI_PRIVATE_CANARY_PREFIX}PARTICIPANT_001_DO_NOT_DISCLOSE` as const;

/** Intentionally invalid: PUBLIC evidence has no private reference variant. */
export const AiPrivateEvidenceRefCanaryFixture = {
  type: "AI_PRIVATE",
  prepAnswerId: "b0000000-0000-4000-8000-000000000001",
} as const;

/** Intentionally invalid fixtures used by privacy boundary tests. */
export const AiPrivateEvaluatorLeakCanaryFixture = {
  ...PublicEvaluatorOutputV1Fixture,
  summaryState: AiPrivateCanaryTokenFixture,
};

export const AiPrivateWikiLeakCanaryFixture = {
  ...LivingWikiVersionV1Fixture,
  document: {
    ...LivingWikiVersionV1Fixture.document,
    participantState: [
      {
        ...LivingWikiPublicParticipantStateFixture,
        publiclyExpressedPosition: AiPrivateCanaryTokenFixture,
      },
    ],
  },
};

export const AiPrivateHostLeakCanaryFixture = {
  ...HostInterventionOutputV1Fixture,
  message: AiPrivateCanaryTokenFixture,
};

export const AiPrivateHostExtraFieldCanaryFixture = {
  ...HostInterventionOutputV1Fixture,
  privateSummary: AiPrivateCanaryTokenFixture,
};
