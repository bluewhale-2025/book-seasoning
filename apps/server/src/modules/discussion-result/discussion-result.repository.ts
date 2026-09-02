import type {
  AiProviderRunV1,
  DiscussionRecordContextV1,
  DiscussionRecordOutputV1,
  PublicContextV1,
  SynthesisOutputV1,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";

export const DISCUSSION_RESULT_REPOSITORY = Symbol(
  "DISCUSSION_RESULT_REPOSITORY",
);

export type SynthesisCommitResult = Readonly<{
  status: "COMMITTED" | "SUPPRESSED_STALE";
  messageId: string | null;
  messageSeq: number | null;
  suppressionReason: string | null;
  duplicate: boolean;
}>;

export type DiscussionRecordCommitResult = Readonly<{
  status: "COMMITTED";
  duplicate: boolean;
}>;

export interface DiscussionResultRepository {
  commitSynthesis(input: Readonly<{
    job: ClaimedAiJob;
    context: PublicContextV1;
    output: SynthesisOutputV1;
    providerRun: AiProviderRunV1 | null;
    fallbackUsed: boolean;
  }>): Promise<SynthesisCommitResult>;

  loadRecordContext(input: Readonly<{
    sessionId: string;
    finalWikiVersion: number;
  }>): Promise<DiscussionRecordContextV1>;

  commitRecord(input: Readonly<{
    job: ClaimedAiJob;
    output: DiscussionRecordOutputV1;
  }>): Promise<DiscussionRecordCommitResult>;
}
