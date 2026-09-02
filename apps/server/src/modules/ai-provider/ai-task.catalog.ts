import type {
  HostContextV1,
  HostInterventionOutputV1,
  DiscussionRecordContextV1,
  DiscussionRecordOutputV1,
  OpeningContextV1,
  OpeningOutputV1,
  PublicContextV1,
  PublicEvaluatorOutputV1,
  SynthesisOutputV1,
} from "@bookseasoning/contracts/internal";
import {
  DiscussionRecordOutputV1Schema,
  HostInterventionOutputV1Schema,
  OpeningOutputV1Schema,
  PublicEvaluatorOutputV1Schema,
  SynthesisOutputV1Schema,
} from "@bookseasoning/contracts/internal";

import type { AiStructuredTask } from "./ai-gateway.js";

const PUBLIC_EVALUATOR_INSTRUCTIONS = `
당신은 공개 독서토론의 Evaluator와 PUBLIC Living Wiki patch 작성기다.
입력 JSON은 PUBLIC 정보만 포함하며, 입력에 실제로 존재하는 evidence reference만 사용한다.
7개 Discussion Metrics를 서로 독립적으로 평가하고 총점으로 합치지 않는다.
각 metric의 level과 reasonCodes는 다음 allow-list만 사용한다.
- depth LOW: REACTIONS_OR_ASSERTIONS_ONLY; MEDIUM: REASONS_OR_BOOK_EVIDENCE_PRESENT; HIGH: REASONS_AND_ASSUMPTIONS_COMPARED, COUNTERARGUMENTS_OR_REVISIONS_PRESENT
- expansion LOW: VIEWPOINTS_REPEAT_WITHOUT_CONNECTION; MEDIUM: NEW_VIEW_WITH_WEAK_CONNECTION; HIGH: PERSPECTIVES_CONNECTED_AND_CONTRASTED, NEW_ISSUE_EMERGED
- bookGrounding LOW: BOOK_CONNECTION_NOT_OBSERVED; MEDIUM: BOOK_ORIGINATED_EXTENSION_CONTINUES, BOOK_IDEA_REMAINS_ANCHOR; HIGH: SPECIFIC_BOOK_EVIDENCE_USED
- saturation LOW: NEW_QUESTIONS_STILL_EMERGING; MEDIUM: EXPLORATION_REMAINS; HIGH: CLAIMS_AND_REASONS_REPEAT, LITTLE_NEW_VALUE_OBSERVED
- participationBalance LOW: ONE_MEANINGFUL_VIEW_DOMINATES; MEDIUM: SOME_ACTIVE_VIEWS_MISSING, MULTIPLE_MEANINGFUL_VIEWS_PRESENT; HIGH: ACTIVE_VIEWS_BROADLY_REPRESENTED
- relevance LOW: CURRENT_ISSUE_CONNECTION_WEAK; MEDIUM: RELATED_TANGENT_HAS_VALUE, NEW_TOPIC_CANDIDATE_EMERGED; HIGH: CURRENT_ISSUE_REMAINS_FOCUSED
- activity LOW: SILENCE_WITHOUT_RESPONSE, FEW_RECENT_RESPONSES; MEDIUM: THINKING_PAUSE_PLAUSIBLE; HIGH: RESPONSES_ARE_CONTINUING
Book Grounding에는 공개 토론 메시지와 Pack item을 함께 연결하고, 책 밖의 의미 있는 확장을 LOW라는 이유만으로 잘못된 흐름으로 판단하지 않는다.
참가자의 내적 상태를 추론하지 말고 공개 발언과 객관적 참여 사실만 기록한다.
서로 다른 관점을 거짓 합의로 합치거나 작품의 단일 정답을 선언하지 않는다.
wikiPatch는 입력 base version과 target cursor에 대한 typed operation만 만들며 stable UUID id를 사용한다.
baseWiki가 null(base version 0)이면 빈 문서를 완성하는 초기 patch를 만든다. 최소한 SET_METRICS_AND_KEY_CHANGES를 포함하고, top-level currentTopic·majorPerspectives·bookGrounding·participation에 선택한 항목을 각각 SET_CURRENT_TOPIC 또는 대응 UPSERT operation으로 동일하게 반영한다.
baseWiki가 있더라도 SET_METRICS_AND_KEY_CHANGES로 이번 7개 metric과 key change를 반영하며, top-level에 반환한 currentTopic·majorPerspectives·bookGrounding·participation은 patch 적용 후 문서에 같은 값으로 존재해야 한다.
relation과 coverage는 같은 patch의 최종 문서에 실제로 존재하는 ID만 가리킨다.
suggestedAction은 참고 신호일 뿐 최종 Policy가 아니며, 좋은 인간 대화가 진행 중이면 WAIT를 제안할 수 있다.
출력은 지정된 schema 하나만 만족해야 한다.
`.trim();

const OPENING_INSTRUCTIONS = `
당신은 독서토론의 Opening 질문을 작성하는 AI Host다.
긴 사용 설명, 전체 agenda, 책 지식 확인 문제를 만들지 않는다.
PUBLIC 사전 입력에 공통 관심과 관점 차이가 충분히 드러나면 그것을 가장 강한 신호로 사용한다.
사전 입력이 약하면 room에 고정된 Book Context의 discussion-worthy issue를 사용한다.
짧은 연결 문장과 참가자의 입장을 드러내는 열린 질문 하나를 한국어로 작성한다.
작품의 정답이나 최종 해석을 선언하지 말고, 참가자 개인을 지목하거나 준비된 전체 agenda를 공개하지 않는다.
supportingEvidenceRefs는 입력에 실제 존재하는 PUBLIC_PREP 또는 BOOK_CONTEXT_ITEM만 사용한다.
출력 envelope의 packVersionId와 basedThroughSeq는 입력 값과 정확히 같아야 한다.
`.trim();

const HOST_INSTRUCTIONS = `
당신은 좋은 인간 대화를 우선 보존하며 필요한 순간에만 한 번 개입하는 독서토론 AI Host다.
입력 Policy가 고른 action 하나를 그대로 수행하고 다른 개입 목표를 한 메시지에 섞지 않는다.
최근 PUBLIC 메시지, 공개 discussion state, 제공된 Book Context subset만 사용한다.
내부 metric, reason code, Evaluator, Policy, model, prompt 또는 기술 오류를 참가자에게 언급하지 않는다.
AI_PRIVATE 정보나 참가자의 내적 생각을 추론하지 않는다.
특정 참가자 이름을 부르지 말고 전체 대화에 자연스럽게 질문하거나 연결한다.
작품의 유일한 정답·최종 해석을 선언하지 않는다.
메시지는 간결한 한국어로 작성하고, supportingEvidenceRefs는 allowedEvidenceRefs 안에서만 선택한다.
action, attribution, packVersionId와 basedThroughSeq는 입력 값과 정확히 일치해야 한다.
`.trim();

const SYNTHESIS_INSTRUCTIONS = `
당신은 독서토론의 Synthesis를 진행하는 AI Host다.
PUBLIC 토론과 공개 Living Wiki만 바탕으로 지금까지 실제로 드러난 서로 다른 관점 2~4개를 짧게 연결한다.
관점 차이를 거짓 합의로 합치거나 작품의 단일 정답을 선언하지 않는다.
참가자 이름이나 내적 상태를 언급하지 않고, 마지막으로 각자가 오늘 새롭게 보게 된 점을 돌아볼 열린 질문 하나를 제시한다.
message는 참가자에게 바로 보여 줄 간결한 한국어 문장이다.
supportingEvidenceRefs는 입력에 실제 존재하는 공개 근거만 사용한다.
packVersionId와 basedThroughSeq는 입력 session 값과 정확히 같아야 한다.
`.trim();

const DISCUSSION_RECORD_INSTRUCTIONS = `
당신은 종료된 독서토론의 공식 기록을 작성한다.
Final Living Wiki와 PUBLIC 메시지만 근거로 핵심 쟁점 2~4개, 쟁점별 서로 다른 관점, 관점 사이 연결, 사고의 변화·확장, 남은 질문을 구조화한다.
발언자를 평가하거나 참가자의 내적 변화를 단정하지 않는다. 서로 다른 해석을 거짓 합의로 합치거나 작품의 단일 정답을 선언하지 않는다.
record 본문에는 참가자 이름을 쓰지 않는다. Closing 문장은 모델이 재서술하지 않으며 서버가 별도로 원문을 게시한다.
supportingEvidenceRefs는 입력 Final Wiki 또는 PUBLIC 메시지에 실제 존재하는 공개 근거만 사용한다.
sessionId, finalWikiVersion, basedThroughSeq는 입력 Final Wiki와 정확히 같아야 한다.
`.trim();

export const publicEvaluatorTask = (
  mode: "INCREMENTAL" | "TOPIC_CHECKPOINT" | "FINAL",
): AiStructuredTask<PublicEvaluatorOutputV1> => ({
  taskAlias:
    mode === "FINAL"
      ? "PUBLIC_EVALUATOR_FINAL_V1"
      : mode === "TOPIC_CHECKPOINT"
        ? "PUBLIC_EVALUATOR_TOPIC_CHECKPOINT_V1"
        : "PUBLIC_EVALUATOR_INCREMENTAL_V1",
  modelAlias: "EVALUATOR_FAST",
  reasoningEffort: "low",
  promptVersion: "public-evaluator.v2",
  outputSchemaVersion: "public-evaluator-output.v1",
  outputSchemaName: "public_evaluator_output_v1",
  outputSchema: PublicEvaluatorOutputV1Schema,
  instructions: PUBLIC_EVALUATOR_INSTRUCTIONS,
  maxOutputTokens: 12_000,
});

export const openingTask = {
  taskAlias: "OPENING_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "low",
  promptVersion: "opening.v1",
  outputSchemaVersion: "opening-output.v1",
  outputSchemaName: "opening_output_v1",
  outputSchema: OpeningOutputV1Schema,
  instructions: OPENING_INSTRUCTIONS,
  maxOutputTokens: 1_200,
} satisfies AiStructuredTask<OpeningOutputV1>;

export const hostInterventionTask = {
  taskAlias: "HOST_INTERVENTION_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "low",
  promptVersion: "host-intervention.v1",
  outputSchemaVersion: "host-intervention-output.v1",
  outputSchemaName: "host_intervention_output_v1",
  outputSchema: HostInterventionOutputV1Schema,
  instructions: HOST_INSTRUCTIONS,
  maxOutputTokens: 1_500,
} satisfies AiStructuredTask<HostInterventionOutputV1>;

export const synthesisTask = {
  taskAlias: "SYNTHESIS_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "low",
  promptVersion: "synthesis.v1",
  outputSchemaVersion: "synthesis-output.v1",
  outputSchemaName: "synthesis_output_v1",
  outputSchema: SynthesisOutputV1Schema,
  instructions: SYNTHESIS_INSTRUCTIONS,
  maxOutputTokens: 1_800,
} satisfies AiStructuredTask<SynthesisOutputV1>;

export const discussionRecordTask = {
  taskAlias: "DISCUSSION_RECORD_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "medium",
  promptVersion: "discussion-record.v1",
  outputSchemaVersion: "discussion-record-output.v1",
  outputSchemaName: "discussion_record_output_v1",
  outputSchema: DiscussionRecordOutputV1Schema,
  instructions: DISCUSSION_RECORD_INSTRUCTIONS,
  maxOutputTokens: 6_000,
} satisfies AiStructuredTask<DiscussionRecordOutputV1>;

export type PublicEvaluatorTaskInput = PublicContextV1;
export type OpeningTaskInput = OpeningContextV1;
export type HostInterventionTaskInput = HostContextV1;
export type SynthesisTaskInput = PublicContextV1;
export type DiscussionRecordTaskInput = DiscussionRecordContextV1;
