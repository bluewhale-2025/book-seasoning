import {
  ClosingResponseCommandResponseSchema,
  DeleteClosingResponseRequestSchema,
  EndSessionResponseSchema,
  ExtendSessionResponseSchema,
  GetDiscussionResultResponseSchema,
  RetryDiscussionResultRequestSchema,
  RetryDiscussionResultResponseSchema,
  SendSessionMessageResponseSchema,
  SessionHeartbeatResponseSchema,
  SessionMessagePageSchema,
  SessionSnapshotSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  StartSynthesisResponseSchema,
  UpsertClosingResponseRequestSchema,
  type ClosingResponseCommandResponse,
  type DeleteClosingResponseRequest,
  type EndSessionRequest,
  type EndSessionResponse,
  type ExtendSessionRequest,
  type ExtendSessionResponse,
  type GetDiscussionResultResponse,
  type RetryDiscussionResultRequest,
  type RetryDiscussionResultResponse,
  type SendSessionMessageRequest,
  type SendSessionMessageResponse,
  type SessionHeartbeatResponse,
  type SessionMessagePage,
  type SessionSnapshot,
  type SessionSyncQuery,
  type StartSessionRequest,
  type StartSessionResponse,
  type StartSynthesisRequest,
  type StartSynthesisResponse,
  type UpsertClosingResponseRequest,
} from "@bookseasoning/contracts/public";

import {
  AuthenticatedHttpClient,
  HttpClientError,
  type AccessTokenProvider,
  type ResponseSchema,
} from "./http-client";

export type SessionApi = Readonly<{
  sync(roomId: string, query: SessionSyncQuery): Promise<SessionSnapshot>;
  getMessagePage(roomId: string, beforeSeq?: number): Promise<SessionMessagePage>;
  sendMessage(
    roomId: string,
    request: SendSessionMessageRequest,
  ): Promise<SendSessionMessageResponse>;
  heartbeat(roomId: string, deviceId: string): Promise<SessionHeartbeatResponse>;
  startSession(
    roomId: string,
    request: StartSessionRequest,
  ): Promise<StartSessionResponse>;
  extendSession(
    roomId: string,
    request: ExtendSessionRequest,
  ): Promise<ExtendSessionResponse>;
  startSynthesis(
    roomId: string,
    request: StartSynthesisRequest,
  ): Promise<StartSynthesisResponse>;
  endSession(
    roomId: string,
    request: EndSessionRequest,
  ): Promise<EndSessionResponse>;
  upsertClosingResponse(
    roomId: string,
    request: UpsertClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse>;
  deleteClosingResponse(
    roomId: string,
    request: DeleteClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse>;
  getDiscussionResult(roomId: string): Promise<GetDiscussionResultResponse>;
  retryDiscussionResult(
    roomId: string,
    request: RetryDiscussionResultRequest,
  ): Promise<RetryDiscussionResultResponse>;
}>;

export { HttpClientError as SessionClientError };

export class HttpSessionApi implements SessionApi {
  private readonly http: AuthenticatedHttpClient;

  public constructor(http: AuthenticatedHttpClient);
  public constructor(
    apiBaseUrl: string,
    getAccessToken: AccessTokenProvider,
    fetcher?: typeof fetch,
    refreshAccessToken?: AccessTokenProvider,
  );
  public constructor(
    apiBaseUrlOrHttp: string | AuthenticatedHttpClient,
    getAccessToken?: AccessTokenProvider,
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    refreshAccessToken?: AccessTokenProvider,
  ) {
    if (apiBaseUrlOrHttp instanceof AuthenticatedHttpClient) {
      this.http = apiBaseUrlOrHttp;
      return;
    }
    if (!getAccessToken) throw new Error("access token provider is required");
    this.http = new AuthenticatedHttpClient({
      apiBaseUrl: apiBaseUrlOrHttp,
      getAccessToken,
      refreshAccessToken,
      fetcher,
    });
  }

  public sync(roomId: string, query: SessionSyncQuery): Promise<SessionSnapshot> {
    const parameters = new URLSearchParams({
      afterEventCursor: String(query.afterEventCursor),
      afterMessageSeq: String(query.afterMessageSeq),
      messageLimit: String(query.messageLimit),
    });
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/sync?${parameters.toString()}`,
      { method: "GET" },
      SessionSnapshotSchema,
    );
  }

  public getMessagePage(roomId: string, beforeSeq?: number): Promise<SessionMessagePage> {
    const parameters = new URLSearchParams({ limit: "50" });
    if (beforeSeq !== undefined) parameters.set("beforeSeq", String(beforeSeq));
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/messages?${parameters.toString()}`,
      { method: "GET" },
      SessionMessagePageSchema,
    );
  }

  public sendMessage(
    roomId: string,
    request: SendSessionMessageRequest,
  ): Promise<SendSessionMessageResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/messages`,
      { method: "POST", body: JSON.stringify(request) },
      SendSessionMessageResponseSchema,
    );
  }

  public heartbeat(roomId: string, deviceId: string): Promise<SessionHeartbeatResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/heartbeat`,
      { method: "POST", body: JSON.stringify({ deviceId }) },
      SessionHeartbeatResponseSchema,
    );
  }

  public startSession(
    roomId: string,
    request: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/start`,
      { method: "POST", body: JSON.stringify(StartSessionRequestSchema.parse(request)) },
      StartSessionResponseSchema,
    );
  }

  public extendSession(
    roomId: string,
    request: ExtendSessionRequest,
  ): Promise<ExtendSessionResponse> {
    return this.sessionCommand(roomId, "extend", request, ExtendSessionResponseSchema);
  }

  public startSynthesis(
    roomId: string,
    request: StartSynthesisRequest,
  ): Promise<StartSynthesisResponse> {
    return this.sessionCommand(
      roomId,
      "synthesis",
      request,
      StartSynthesisResponseSchema,
    );
  }

  public endSession(
    roomId: string,
    request: EndSessionRequest,
  ): Promise<EndSessionResponse> {
    return this.sessionCommand(roomId, "end", request, EndSessionResponseSchema);
  }

  public upsertClosingResponse(
    roomId: string,
    request: UpsertClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/closing/response`,
      {
        method: "PUT",
        body: JSON.stringify(UpsertClosingResponseRequestSchema.parse(request)),
      },
      ClosingResponseCommandResponseSchema,
    );
  }

  public deleteClosingResponse(
    roomId: string,
    request: DeleteClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/closing/response`,
      {
        method: "DELETE",
        body: JSON.stringify(DeleteClosingResponseRequestSchema.parse(request)),
      },
      ClosingResponseCommandResponseSchema,
    );
  }

  public getDiscussionResult(roomId: string): Promise<GetDiscussionResultResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/result`,
      { method: "GET" },
      GetDiscussionResultResponseSchema,
    );
  }

  public retryDiscussionResult(
    roomId: string,
    request: RetryDiscussionResultRequest,
  ): Promise<RetryDiscussionResultResponse> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/result/retry`,
      {
        method: "POST",
        body: JSON.stringify(RetryDiscussionResultRequestSchema.parse(request)),
      },
      RetryDiscussionResultResponseSchema,
    );
  }

  private sessionCommand<T>(
    roomId: string,
    action: "extend" | "synthesis" | "end",
    request: ExtendSessionRequest | StartSynthesisRequest | EndSessionRequest,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    return this.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/session/${action}`,
      { method: "POST", body: JSON.stringify(request) },
      schema,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    return this.http.request(path, init, schema);
  }
}
