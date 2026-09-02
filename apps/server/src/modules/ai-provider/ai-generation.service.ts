import { Inject, Injectable } from "@nestjs/common";

import {
  AI_GATEWAY,
  AiGatewayInvocationError,
  type AiGateway,
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
    try {
      const result = await this.gateway.generate(task, input);
      await this.repository.recordSuccess({ ...correlation, run: result.run });
      return result;
    } catch (error) {
      if (error instanceof AiGatewayInvocationError) {
        await this.repository.recordFailure({
          ...correlation,
          taskAlias: task.taskAlias,
          errorCode: error.code,
          run: error.run,
        });
      }
      throw error;
    }
  }
}
