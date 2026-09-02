import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import { AuthProvider } from "../../app/auth-provider";
import { AuthClientError, type AuthApi } from "../../data/auth-api";
import { AuthenticatedHttpClient } from "../../data/http-client";
import {
  accountApiStub,
  bookBuilderAdminApiStub,
  roomApiStub,
  sessionApiStub,
} from "../../test/runtime-stubs";
import { ForgotPasswordPage, LoginPage, SignUpPage } from "./auth-pages";

const authUser = {
  userId: "90000000-0000-4000-8000-000000000001",
  email: "reader@example.com",
};

let turnstileOptions: Parameters<TurnstileApi["render"]>[1] | undefined;
let turnstileReset: TurnstileApi["reset"];

function authApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    signUp: vi.fn().mockResolvedValue(authUser),
    signIn: vi.fn().mockResolvedValue(authUser),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    exchangePasswordResetCode: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue(null),
    refreshAccessToken: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function renderAuthPage(
  path: string,
  page: React.ReactElement,
  auth: AuthApi,
  turnstileSiteKey = "site-key",
) {
  const runtime: AppRuntime = {
    account: accountApiStub(),
    auth,
    bookBuilder: bookBuilderAdminApiStub(),
    books: { getCatalog: vi.fn() },
    http: new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => null,
    }),
    profile: { getProfile: vi.fn(), updateProfile: vi.fn() },
    rooms: roomApiStub(),
    sessions: sessionApiStub(),
    turnstileSiteKey,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRuntimeProvider runtime={runtime}>
          <AuthProvider>
            <Routes>
              <Route path={path} element={page} />
              <Route path="/discussions" element={<p>토론 목록</p>} />
            </Routes>
          </AuthProvider>
        </AppRuntimeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  turnstileOptions = undefined;
  turnstileReset = vi.fn<(widgetId: string) => void>();
  window.turnstile = {
    render: vi.fn((_container, options) => {
      turnstileOptions = options;
      return "widget-1";
    }),
    remove: vi.fn(),
    reset: turnstileReset,
  };
});

afterEach(() => {
  delete window.turnstile;
});

async function resolveChallenge(token = "challenge-token") {
  await waitFor(() => expect(turnstileOptions).toBeDefined());
  act(() => turnstileOptions?.callback(token));
}

describe("authentication pages", () => {
  it("requires a signup challenge and forwards only its verified token", async () => {
    const auth = authApi();
    const interaction = userEvent.setup();
    renderAuthPage("/auth/signup", <SignUpPage />, auth);

    await interaction.type(screen.getByLabelText("프로필 이름"), "독서가");
    await interaction.type(screen.getByLabelText("이메일"), "reader@example.com");
    await interaction.type(screen.getByLabelText("비밀번호"), "secret-password");
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();

    await resolveChallenge();
    expect(turnstileOptions).toEqual(expect.objectContaining({
      action: "signup",
      appearance: "interaction-only",
      "response-field": false,
    }));
    await interaction.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({
      email: "reader@example.com",
      password: "secret-password",
      profileName: "독서가",
      captchaToken: "challenge-token",
    }));
    expect(await screen.findByText("토론 목록")).toBeInTheDocument();
  });

  it("invalidates the consumed challenge after a provider rejection", async () => {
    const auth = authApi({
      signUp: vi.fn().mockRejectedValue(new AuthClientError("CAPTCHA_FAILED")),
    });
    const interaction = userEvent.setup();
    renderAuthPage("/auth/signup", <SignUpPage />, auth);

    await interaction.type(screen.getByLabelText("프로필 이름"), "독서가");
    await interaction.type(screen.getByLabelText("이메일"), "reader@example.com");
    await interaction.type(screen.getByLabelText("비밀번호"), "secret-password");
    await resolveChallenge("expired-token");
    await interaction.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "보안 확인이 만료되었습니다. 다시 확인해 주세요.",
    );
    expect(turnstileReset).toHaveBeenCalledWith("widget-1");
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
  });

  it("uses the password-reset action and forwards its verified token", async () => {
    const auth = authApi();
    const interaction = userEvent.setup();
    renderAuthPage("/auth/forgot-password", <ForgotPasswordPage />, auth);

    await interaction.type(screen.getByLabelText("이메일"), "reader@example.com");
    expect(screen.getByRole("button", { name: "재설정 메일 받기" })).toBeDisabled();
    await resolveChallenge();
    expect(turnstileOptions?.action).toBe("password_reset");
    await interaction.click(screen.getByRole("button", { name: "재설정 메일 받기" }));

    await waitFor(() => expect(auth.requestPasswordReset).toHaveBeenCalledWith(
      "reader@example.com",
      "http://localhost:3000/auth/reset",
      "challenge-token",
    ));
    expect(await screen.findByText("메일을 확인해 주세요")).toBeInTheDocument();
  });

  it("requires and forwards a login challenge under the global Auth policy", async () => {
    const auth = authApi();
    const interaction = userEvent.setup();
    renderAuthPage("/auth/login", <LoginPage />, auth);

    await interaction.type(screen.getByLabelText("이메일"), "reader@example.com");
    await interaction.type(screen.getByLabelText("비밀번호"), "secret-password");
    expect(screen.getByRole("button", { name: "로그인" })).toBeDisabled();
    await resolveChallenge();
    expect(turnstileOptions?.action).toBe("login");
    await interaction.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith(
      "reader@example.com",
      "secret-password",
      "challenge-token",
    ));
  });
});
