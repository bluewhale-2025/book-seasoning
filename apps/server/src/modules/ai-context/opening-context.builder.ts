import { Inject, Injectable } from "@nestjs/common";

import {
  OpeningContextV1Schema,
  type OpeningContextV1,
} from "@bookseasoning/contracts/internal";

import {
  BOOK_CONTEXT_PROVIDER,
  type BookContextProvider,
} from "../book-context/book-context.provider.js";
import {
  PUBLIC_CONTEXT_REPOSITORY,
  type PublicContextRepository,
} from "./public-context.repository.js";

export type BuildOpeningContextInput = Readonly<{
  sessionId: string;
  baseWikiVersion: number;
  targetThroughSeq: number;
}>;

export const OPENING_BOOK_ITEM_BUDGET = 8;

export class OpeningContextBuildError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "OpeningContextBuildError";
  }
}

@Injectable()
export class OpeningContextBuilder {
  public constructor(
    @Inject(PUBLIC_CONTEXT_REPOSITORY)
    private readonly repository: PublicContextRepository,
    @Inject(BOOK_CONTEXT_PROVIDER)
    private readonly bookContextProvider: BookContextProvider,
  ) {}

  public async build(
    input: BuildOpeningContextInput,
  ): Promise<OpeningContextV1> {
    const frame = await this.repository.loadFrame(input);
    if (frame.session.phase !== "OPENING") {
      throw new OpeningContextBuildError("OPENING_PHASE_NOT_ALLOWED");
    }
    const publicPrep = await this.repository.listPublicPrep({
      sessionId: input.sessionId,
    });
    const bookContext = await this.bookContextProvider.getPackVersion({
      packVersionId: frame.session.pinnedPackVersionId,
      consumer: "OPENING",
      query: publicPrep
        .map((answer) => answer.body)
        .join("\n")
        .slice(0, 4_000),
      maxItems: OPENING_BOOK_ITEM_BUDGET,
    });
    if (bookContext.packVersionId !== frame.session.pinnedPackVersionId) {
      throw new OpeningContextBuildError("OPENING_PACK_VERSION_MISMATCH");
    }
    return OpeningContextV1Schema.parse({
      schemaVersion: "opening-context.v1",
      session: {
        sessionId: frame.session.sessionId,
        roomId: frame.session.roomId,
        pinnedPackVersionId: frame.session.pinnedPackVersionId,
        phase: frame.session.phase,
        phaseVersion: frame.session.phaseVersion,
        basedThroughSeq: input.targetThroughSeq,
      },
      publicPrep: publicPrep.map((answer) => ({
        prepAnswerId: answer.prepAnswerId,
        promptType: answer.promptType,
        body: answer.body,
      })),
      bookContext,
    });
  }
}
