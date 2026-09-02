import type {
  LivingWikiDocumentV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

export const LIVING_WIKI_REPOSITORY = Symbol("LIVING_WIKI_REPOSITORY");

export type LivingWikiCommitKind = "INCREMENTAL" | "TOPIC_CHECKPOINT" | "FINAL";

export type CommitLivingWikiCandidateInput = Readonly<{
  jobId: string;
  attemptNo: number;
  sessionId: string;
  kind: LivingWikiCommitKind;
  baseVersion: number;
  basedThroughSeq: number;
  document: LivingWikiDocumentV1;
  evaluatorOutput: PublicEvaluatorOutputV1;
}>;

export type LivingWikiCommitResult = Readonly<{
  evaluationId: string | null;
  status: "COMMITTED" | "SUPPRESSED_STALE_BASE";
  committedWikiVersion: number | null;
  currentWikiVersion: number;
  currentBasedThroughSeq: number;
  wroteWikiVersion: boolean;
  shouldRequeue: boolean;
}>;

export type CommitInsufficientFinalInput = Readonly<{
  jobId: string;
  attemptNo: number;
  sessionId: string;
  baseVersion: number;
  basedThroughSeq: number;
  document: LivingWikiDocumentV1;
}>;

export interface LivingWikiRepository {
  commitCandidate(
    input: CommitLivingWikiCandidateInput,
  ): Promise<LivingWikiCommitResult>;
  commitInsufficientFinal(
    input: CommitInsufficientFinalInput,
  ): Promise<LivingWikiCommitResult>;
}
