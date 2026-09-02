import type {
  PublicContextFrameV1,
  PublicPrepAnswerV1,
  PublicRawMessageV1,
} from "@bookseasoning/contracts/internal";

export const PUBLIC_CONTEXT_REPOSITORY = Symbol("PUBLIC_CONTEXT_REPOSITORY");

export type LoadPublicContextFrameInput = Readonly<{
  sessionId: string;
  baseWikiVersion: number;
  targetThroughSeq: number;
}>;

export type PublicMessageRangeInput = Readonly<{
  sessionId: string;
  fromSeq: number;
  throughSeq: number;
  limit: number;
}>;

export type PublicMessageIdsInput = Readonly<{
  sessionId: string;
  messageIds: readonly string[];
  throughSeq: number;
}>;

export type PublicPrepInput = Readonly<{
  sessionId: string;
  prepAnswerIds?: readonly string[];
}>;

/**
 * PUBLIC-lane Raw Data only. A private prep repository must never implement or
 * be injected through this port.
 */
export interface PublicContextRepository {
  loadFrame(input: LoadPublicContextFrameInput): Promise<PublicContextFrameV1>;

  listMessages(
    input: PublicMessageRangeInput,
  ): Promise<readonly PublicRawMessageV1[]>;

  findMessagesByIds(
    input: PublicMessageIdsInput,
  ): Promise<readonly PublicRawMessageV1[]>;

  listPublicPrep(
    input: PublicPrepInput,
  ): Promise<readonly PublicPrepAnswerV1[]>;
}
