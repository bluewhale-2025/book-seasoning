import {
  AccountDeletionPreviewSchema,
  DeleteAccountRequestSchema,
  DeleteAccountResponseSchema,
  type AccountDeletionPreview,
  type DeleteAccountRequest,
  type DeleteAccountResponse,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedHttpClient } from "./http-client";

export type AccountApi = Readonly<{
  getDeletionPreview(): Promise<AccountDeletionPreview>;
  deleteAccount(request: DeleteAccountRequest): Promise<DeleteAccountResponse>;
}>;

export class HttpAccountApi implements AccountApi {
  public constructor(private readonly http: AuthenticatedHttpClient) {}

  public getDeletionPreview() {
    return this.http.request(
      "/v1/me/account/deletion-preview",
      { method: "GET" },
      AccountDeletionPreviewSchema,
    );
  }

  public deleteAccount(request: DeleteAccountRequest) {
    return this.http.request(
      "/v1/me/account",
      { method: "DELETE", body: JSON.stringify(DeleteAccountRequestSchema.parse(request)) },
      DeleteAccountResponseSchema,
    );
  }
}
