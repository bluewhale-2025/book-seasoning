import { Injectable } from "@nestjs/common";

const FORBIDDEN_PATTERNS = [
  /AI_PRIVATE/i,
  /Discussion\s*Metrics/i,
  /(?:Evaluator|Policy\s*Action|prompt\s*version)/i,
  /(?:내부|토론)\s*(?:점수|지표)/,
  /(?:모델명|프롬프트|reason\s*code)/i,
  /유일한\s*(?:정답|해석)/,
  /(?:정답|작품의\s*의미)은\s*[^.!?]{0,80}(?:뿐|입니다)/,
] as const;

export class PublicAiOutputSafetyError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PublicAiOutputSafetyError";
  }
}

@Injectable()
export class PublicAiOutputSafetyValidator {
  public assertSafe(
    message: string,
    options: Readonly<{
      maxLength: number;
      forbiddenProfileNames?: readonly string[];
    }>,
  ): void {
    if (message.length > options.maxLength) {
      this.fail("PUBLIC_AI_MESSAGE_TOO_LONG");
    }
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(message))) {
      this.fail("PUBLIC_AI_FORBIDDEN_PATTERN");
    }
    const profileNames = options.forbiddenProfileNames ?? [];
    if (
      profileNames.some(
        (name) => name.trim().length >= 2 && message.includes(name.trim()),
      )
    ) {
      this.fail("PUBLIC_AI_PARTICIPANT_TARGETING_FORBIDDEN");
    }
  }

  private fail(code: string): never {
    throw new PublicAiOutputSafetyError(code);
  }
}
