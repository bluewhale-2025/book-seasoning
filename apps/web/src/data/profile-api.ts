import {
  ProfileSchema,
  UpdateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedHttpClient } from "./http-client";

export type ProfileApi = Readonly<{
  getProfile(): Promise<Profile>;
  updateProfile(request: UpdateProfileRequest): Promise<Profile>;
}>;

export class HttpProfileApi implements ProfileApi {
  public constructor(private readonly http: AuthenticatedHttpClient) {}

  public getProfile(): Promise<Profile> {
    return this.http.request("/v1/me/profile", { method: "GET" }, ProfileSchema);
  }

  public updateProfile(request: UpdateProfileRequest): Promise<Profile> {
    return this.http.request(
      "/v1/me/profile",
      { method: "PATCH", body: JSON.stringify(UpdateProfileRequestSchema.parse(request)) },
      ProfileSchema,
    );
  }
}
