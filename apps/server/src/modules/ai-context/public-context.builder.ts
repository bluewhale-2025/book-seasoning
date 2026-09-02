import { Inject, Injectable } from "@nestjs/common";

import {
  PublicContextV1Schema,
  type PublicContextV1,
} from "@bookseasoning/contracts/internal";

import {
  BOOK_CONTEXT_PROVIDER,
  type BookContextProvider,
} from "../book-context/book-context.provider.js";
import {
  PUBLIC_CONTEXT_REPOSITORY,
  type PublicContextRepository,
} from "./public-context.repository.js";

const SURROUNDING_MESSAGE_COUNT = 6;
const MAX_CONTEXT_MESSAGES = 200;

export type BuildPublicContextInput = Readonly<{
  sessionId: string;
  baseWikiVersion: number;
  targetThroughSeq: number;
}>;

export class PublicContextBuildError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PublicContextBuildError";
  }
}

@Injectable()
export class PublicContextBuilder {
  public constructor(
    @Inject(PUBLIC_CONTEXT_REPOSITORY)
    private readonly repository: PublicContextRepository,
    @Inject(BOOK_CONTEXT_PROVIDER)
    private readonly bookContextProvider: BookContextProvider,
  ) {}

  public async build(input: BuildPublicContextInput): Promise<PublicContextV1> {
    const frame = await this.repository.loadFrame(input);
    this.validateFrame(input, frame);
    const fromSeq = this.contextWindowStart(frame, input.targetThroughSeq);
    const messagePromise =
      input.targetThroughSeq === 0
        ? Promise.resolve([])
        : this.repository.listMessages({
            sessionId: input.sessionId,
            fromSeq,
            throughSeq: input.targetThroughSeq,
            limit: MAX_CONTEXT_MESSAGES + 1,
          });

    const [messages, publicPrep, bookContext] = await Promise.all([
      messagePromise,
      this.repository.listPublicPrep({ sessionId: input.sessionId }),
      this.bookContextProvider.getPackVersion({
        packVersionId: frame.session.pinnedPackVersionId,
        consumer: "EVALUATOR",
        maxItems: Number.MAX_SAFE_INTEGER,
      }),
    ]);

    if (messages.length > MAX_CONTEXT_MESSAGES) {
      throw new PublicContextBuildError("PUBLIC_CONTEXT_MESSAGE_BUDGET_EXCEEDED");
    }
    if (bookContext.packVersionId !== frame.session.pinnedPackVersionId) {
      throw new PublicContextBuildError("PUBLIC_CONTEXT_PACK_VERSION_MISMATCH");
    }

    return PublicContextV1Schema.parse({
      schemaVersion: "public-context.v1",
      ...frame,
      messages,
      publicPrep,
      bookContext,
    });
  }

  private validateFrame(
    input: BuildPublicContextInput,
    frame: Awaited<ReturnType<PublicContextRepository["loadFrame"]>>,
  ): void {
    if (frame.session.sessionId !== input.sessionId) {
      throw new PublicContextBuildError("PUBLIC_CONTEXT_SESSION_MISMATCH");
    }
    if (frame.session.targetThroughSeq !== input.targetThroughSeq) {
      throw new PublicContextBuildError("PUBLIC_CONTEXT_CURSOR_MISMATCH");
    }
    if (
      (input.baseWikiVersion === 0 && frame.baseWiki !== null) ||
      (input.baseWikiVersion > 0 &&
        frame.baseWiki?.version !== input.baseWikiVersion)
    ) {
      throw new PublicContextBuildError("PUBLIC_CONTEXT_BASE_WIKI_MISMATCH");
    }
  }

  private contextWindowStart(
    frame: Awaited<ReturnType<PublicContextRepository["loadFrame"]>>,
    targetThroughSeq: number,
  ): number {
    const nextUnseenSeq = (frame.baseWiki?.basedThroughSeq ?? 0) + 1;
    const anchor =
      nextUnseenSeq <= targetThroughSeq
        ? nextUnseenSeq
        : Math.max(1, targetThroughSeq);
    return Math.max(1, anchor - SURROUNDING_MESSAGE_COUNT);
  }
}
