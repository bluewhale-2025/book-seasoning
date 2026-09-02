import { PublicErrorSchema } from "@bookseasoning/contracts/public";

export type ResponseSchema<T> = Readonly<{ parse(value: unknown): T }>;
export type AccessTokenProvider = () => Promise<string | null>;

export type AuthenticatedHttpClientOptions = Readonly<{
  apiBaseUrl: string;
  getAccessToken: AccessTokenProvider;
  refreshAccessToken?: AccessTokenProvider;
  onAuthRequired?: () => Promise<void> | void;
  fetcher?: typeof fetch;
}>;

export class HttpClientError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
    public readonly requestId?: string,
    public readonly aggregateVersion?: number,
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

export class AuthenticatedHttpClient {
  private readonly fetcher: typeof fetch;

  public constructor(private readonly options: AuthenticatedHttpClientOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  public async request<T>(
    path: string,
    init: RequestInit,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    const accessToken = await this.options.getAccessToken();
    if (accessToken === null) {
      await this.options.onAuthRequired?.();
      throw new HttpClientError("AUTH_REQUIRED", 401, "로그인이 필요합니다.");
    }

    const first = await this.send(path, init, accessToken);
    if (!this.isAuthRequired(first)) return this.parseResponse(first, schema);

    const refreshedToken = await this.options.refreshAccessToken?.();
    if (refreshedToken === null || refreshedToken === undefined) {
      await this.options.onAuthRequired?.();
      throw this.toError(first);
    }

    const retry = await this.send(path, init, refreshedToken);
    if (this.isAuthRequired(retry)) await this.options.onAuthRequired?.();
    return this.parseResponse(retry, schema);
  }

  private async send(
    path: string,
    init: RequestInit,
    accessToken: string,
  ): Promise<Readonly<{ response: Response; payload: unknown }>> {
    let response: Response;
    try {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      headers.authorization = `Bearer ${accessToken}`;
      if (init.body !== undefined && headers["content-type"] === undefined) {
        headers["content-type"] = "application/json";
      }
      response = await this.fetcher(`${this.options.apiBaseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new HttpClientError(
        "NETWORK_UNAVAILABLE",
        0,
        "네트워크 연결을 확인해 주세요.",
      );
    }

    return { response, payload: await response.json().catch(() => null) };
  }

  private isAuthRequired(result: Readonly<{ response: Response; payload: unknown }>) {
    if (result.response.status !== 401) return false;
    const parsed = PublicErrorSchema.safeParse(result.payload);
    return parsed.success && parsed.data.code === "AUTH_REQUIRED";
  }

  private parseResponse<T>(
    result: Readonly<{ response: Response; payload: unknown }>,
    schema: ResponseSchema<T>,
  ): T {
    if (!result.response.ok) throw this.toError(result);

    try {
      return schema.parse(result.payload);
    } catch {
      throw new HttpClientError(
        "INVALID_SERVER_RESPONSE",
        502,
        "서버 응답을 확인하지 못했습니다.",
      );
    }
  }

  private toError(result: Readonly<{ response: Response; payload: unknown }>) {
    const error = PublicErrorSchema.safeParse(result.payload);
    if (!error.success) {
      return new HttpClientError(
        "REQUEST_FAILED",
        result.response.status,
        "요청을 처리하지 못했습니다.",
      );
    }

    return new HttpClientError(
      error.data.code,
      result.response.status,
      error.data.message,
      error.data.requestId,
      error.data.aggregateVersion,
    );
  }
}
