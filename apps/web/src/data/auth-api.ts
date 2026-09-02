import type { AuthChangeEvent, Session, SupabaseClient, User } from "@supabase/supabase-js";

export type AuthUser = Readonly<{
  userId: string;
  email: string;
}>;

export type SignUpInput = Readonly<{
  email: string;
  password: string;
  profileName: string;
  captchaToken?: string;
}>;

export type AuthApi = Readonly<{
  getCurrentUser(): Promise<AuthUser | null>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signIn(email: string, password: string, captchaToken?: string): Promise<AuthUser>;
  requestPasswordReset(email: string, redirectTo: string, captchaToken?: string): Promise<void>;
  exchangePasswordResetCode(code: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
}>;

export class AuthClientError extends Error {
  public constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "AuthClientError";
  }
}

function toAuthUser(user: User | null): AuthUser | null {
  if (!user?.email) return null;
  return { userId: user.id, email: user.email };
}

function requireAuthUser(user: User | null): AuthUser {
  const result = toAuthUser(user);
  if (result === null) throw new AuthClientError("AUTH_SESSION_MISSING");
  return result;
}

function mapAuthError(error: Readonly<{ code?: string; message: string }>): AuthClientError {
  if (
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    /already registered|already exists/i.test(error.message)
  ) {
    return new AuthClientError("EMAIL_ALREADY_EXISTS");
  }
  if (error.code === "invalid_credentials") {
    return new AuthClientError("INVALID_CREDENTIALS");
  }
  if (error.code === "weak_password") return new AuthClientError("WEAK_PASSWORD");
  if (error.code === "captcha_failed" || /captcha/i.test(error.message)) {
    return new AuthClientError("CAPTCHA_FAILED");
  }
  if (error.code === "over_request_rate_limit") {
    return new AuthClientError("RATE_LIMITED");
  }
  return new AuthClientError("AUTH_REQUEST_FAILED");
}

export class SupabaseAuthApi implements AuthApi {
  public constructor(private readonly supabase: SupabaseClient) {}

  public async getCurrentUser(): Promise<AuthUser | null> {
    const result = await this.supabase.auth.getSession();
    if (result.error) throw mapAuthError(result.error);
    return toAuthUser(result.data.session?.user ?? null);
  }

  public subscribe(listener: (user: AuthUser | null) => void): () => void {
    const subscription = this.supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        listener(toAuthUser(session?.user ?? null));
      },
    );
    return () => subscription.data.subscription.unsubscribe();
  }

  public async signUp(input: SignUpInput): Promise<AuthUser> {
    const result = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { profile_name: input.profileName },
        captchaToken: input.captchaToken,
      },
    });
    if (result.error) throw mapAuthError(result.error);
    return requireAuthUser(result.data.user);
  }

  public async signIn(
    email: string,
    password: string,
    captchaToken?: string,
  ): Promise<AuthUser> {
    const result = await this.supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    if (result.error) throw mapAuthError(result.error);
    return requireAuthUser(result.data.user);
  }

  public async requestPasswordReset(
    email: string,
    redirectTo: string,
    captchaToken?: string,
  ): Promise<void> {
    const result = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
      captchaToken,
    });
    if (result.error) throw mapAuthError(result.error);
  }

  public async exchangePasswordResetCode(code: string): Promise<void> {
    const result = await this.supabase.auth.exchangeCodeForSession(code);
    if (result.error) throw mapAuthError(result.error);
  }

  public async updatePassword(password: string): Promise<void> {
    const result = await this.supabase.auth.updateUser({ password });
    if (result.error) throw mapAuthError(result.error);
  }

  public async signOut(): Promise<void> {
    const result = await this.supabase.auth.signOut();
    if (result.error) throw mapAuthError(result.error);
  }

  public async getAccessToken(): Promise<string | null> {
    const result = await this.supabase.auth.getSession();
    if (result.error) return null;
    return result.data.session?.access_token ?? null;
  }

  public async refreshAccessToken(): Promise<string | null> {
    const result = await this.supabase.auth.refreshSession();
    if (result.error) return null;
    return result.data.session?.access_token ?? null;
  }
}
