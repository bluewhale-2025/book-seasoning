export type AuthenticatedActor = Readonly<{
  userId: string;
  accessToken: string;
}>;

export interface AuthTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedActor>;
}

export const AUTH_TOKEN_VERIFIER = Symbol("AUTH_TOKEN_VERIFIER");
