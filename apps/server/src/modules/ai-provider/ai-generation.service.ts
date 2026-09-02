import { Inject, Injectable } from "@nestjs/common";

import type { AiProviderRunV1 } from "@bookseasoning/contracts/internal";

import {
  AI_GATEWAY,
  AiGatewayInvocationError,
  type AiGateway,
  type AiGatewayFailureRun,
  type AiGatewayResult,
  type AiStructuredTask,
} from "./ai-gateway.js";
import {
  AI_PROVIDER_RUN_REPOSITORY,
  type AiProviderRunCorrelation,
  type AiProviderRunRepository,
} from "./ai-provider-run.repository.js";

@Injectable()
export class AiGenerationService {
  public constructor(
    @Inject(AI_GATEWAY) private readonly gateway: AiGateway,
    @Inject(AI_PROVIDER_RUN_REPOSITORY)
    private readonly repository: AiProviderRunRepository,
  ) {}

  public get configured(): boolean {
    return this.gateway.configured;
  }

  public async generate<T>(
    correlation: AiProviderRunCorrelation,
    task: AiStructuredTask<T>,
    input: unknown,
  ): Promise<AiGatewayResult<T>> {
    let result: AiGatewayResult<T>;
    try {
      result = await this.gateway.generate(task, input);
    } catch (error) {
      if (error instanceof AiGatewayInvocationError) {
        try {
          await this.repository.recordFailure({
            ...correlation,
            taskAlias: task.taskAlias,
            errorCode: error.code,
            run: error.run,
          });
        } catch {
          throw this.persistenceFailure(error.run);
        }
      }
      throw error;
    }

    try {
      await this.repository.recordSuccess({ ...correlation, run: result.run });
    } catch {
      throw this.persistenceFailure(result.run);
    }
    return result;
  }

  private persistenceFailure(
    run: AiGatewayFailureRun | AiProviderRunV1,
  ): AiGatewayInvocationError {
    return new AiGatewayInvocationError(
      "AI_PROVIDER_RUN_PERSIST_FAILED",
      true,
      {
        taskAlias: run.taskAlias,
        promptVersion: run.promptVersion,
        outputSchemaVersion: run.outputSchemaVersion,
        provider: run.provider,
        model: run.model,
        reasoningEffort: run.reasoningEffort,
        latencyMs: run.latencyMs,
      },
    );
  }
}
