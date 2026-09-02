import type {
  EndSessionResponse,
  ExtendSessionResponse,
  SendSessionMessageResponse,
  RequestSessionAiHelpResponse,
  SessionHeartbeatResponse,
  SessionMessagePage,
  SessionMessagePageQuery,
  SessionSnapshot,
  SessionSyncQuery,
  StartSessionResponse,
  StartSynthesisResponse,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export type SessionHeartbeatGatewayInput = Readonly<{
  roomId: string;
  deviceId: string;
}>;

export type AppendSessionMessageGatewayInput = Readonly<{
  roomId: string;
  clientMessageId: string;
  body: string;
  replyToMessageId: string | null;
}>;

export type SessionSyncGatewayInput = Readonly<{
  roomId: string;
}> & SessionSyncQuery;

export type SessionMessagePageGatewayInput = Readonly<{
  roomId: string;
}> & SessionMessagePageQuery;

export type StartSessionGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  expectedPhaseVersion: number;
}>;

export type SessionControlGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  expectedPhaseVersion: number;
}>;

export type RequestSessionAiHelpGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  expectedPhaseVersion: number;
  reason:
    | "CONVERSATION_STOPPED"
    | "DISCUSSION_STUCK_OR_REPETITIVE"
    | "TOO_FAR_OFF_TOPIC"
    | "CONFLICT_NEEDS_REFRAMING";
}>;

export class SessionGatewayError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "SessionGatewayError";
  }
}

export interface SessionGateway {
  appendMessage(
    actor: AuthenticatedActor,
    input: AppendSessionMessageGatewayInput,
  ): Promise<SendSessionMessageResponse>;
  sync(
    actor: AuthenticatedActor,
    input: SessionSyncGatewayInput,
  ): Promise<SessionSnapshot>;
  getMessagePage(
    actor: AuthenticatedActor,
    input: SessionMessagePageGatewayInput,
  ): Promise<SessionMessagePage>;
  heartbeat(
    actor: AuthenticatedActor,
    input: SessionHeartbeatGatewayInput,
  ): Promise<SessionHeartbeatResponse>;
  requestAiHelp(
    actor: AuthenticatedActor,
    input: RequestSessionAiHelpGatewayInput,
  ): Promise<RequestSessionAiHelpResponse>;
  start(
    actor: AuthenticatedActor,
    input: StartSessionGatewayInput,
  ): Promise<StartSessionResponse>;
  extend(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<ExtendSessionResponse>;
  startSynthesis(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<StartSynthesisResponse>;
  end(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<EndSessionResponse>;
}

export const SESSION_GATEWAY = Symbol("SESSION_GATEWAY");
