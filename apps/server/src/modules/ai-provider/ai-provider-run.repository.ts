import type {
  AiProviderRunV1,
  AiTaskAlias,
} from "@bookseasoning/contracts/internal";

import type { AiGatewayFailureRun } from "./ai-gateway.js";

export const AI_PROVIDER_RUN_REPOSITORY = Symbol(
  "AI_PROVIDER_RUN_REPOSITORY",
);

export type AiProviderRunCorrelation = Readonly<{
  jobId: string;
  attemptNo: number;
}>;

export type RecordAiProviderSuccessInput = AiProviderRunCorrelation &
  Readonly<{ run: AiProviderRunV1 }>;

export type RecordAiProviderFailureInput = AiProviderRunCorrelation &
  Readonly<{
    taskAlias: AiTaskAlias;
    errorCode: string;
    run: AiGatewayFailureRun;
  }>;

export interface AiProviderRunRepository {
  recordSuccess(input: RecordAiProviderSuccessInput): Promise<void>;
  recordFailure(input: RecordAiProviderFailureInput): Promise<void>;
}
