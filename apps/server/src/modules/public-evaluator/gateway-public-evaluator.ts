import { Inject, Injectable } from "@nestjs/common";

import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import { publicEvaluatorPromptInput } from "../ai-context/public-context-evidence.js";
import { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { publicEvaluatorTask } from "../ai-provider/ai-task.catalog.js";
import {
  PublicEvaluatorInvocationError,
  PublicEvaluatorUnavailableError,
  type PublicEvaluator,
  type PublicEvaluatorInput,
} from "./public-evaluator.js";

@Injectable()
export class GatewayPublicEvaluator implements PublicEvaluator {
  public constructor(
    @Inject(AiGenerationService)
    private readonly generation: AiGenerationService,
  ) {}

  public async evaluate(input: PublicEvaluatorInput): Promise<unknown> {
    try {
      const result = await this.generation.generate(
        { jobId: input.jobId, attemptNo: input.attemptNo },
        publicEvaluatorTask(input.task),
        publicEvaluatorPromptInput(input.context),
      );
      return result.output;
    } catch (error) {
      if (error instanceof AiGatewayUnavailableError) {
        throw new PublicEvaluatorUnavailableError();
      }
      if (error instanceof AiGatewayInvocationError) {
        throw new PublicEvaluatorInvocationError(error.code, error.retryable);
      }
      throw error;
    }
  }
}
