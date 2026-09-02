import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import { AuthProvider } from "../../app/auth-provider";
import type { AuthApi, AuthUser } from "../../data/auth-api";
import { AuthenticatedHttpClient } from "../../data/http-client";
import { accountApiStub, bookBuilderAdminApiStub, roomApiStub, sessionApiStub } from "../../test/runtime-stubs";
import { ProtectedRoute } from "./auth-route-guards";

describe("ProtectedRoute", () => {
  it("does not render protected content before the auth state is resolved", async () => {
    let resolveUser: ((user: AuthUser | null) => void) | undefined;
    const currentUser = new Promise<AuthUser | null>((resolve) => {
      resolveUser = resolve;
    });
    const auth: AuthApi = {
      getCurrentUser: vi.fn().mockReturnValue(currentUser),
      subscribe: vi.fn().mockReturnValue(() => undefined),
      signUp: vi.fn(),
      signIn: vi.fn(),
      requestPasswordReset: vi.fn(),
      exchangePasswordResetCode: vi.fn(),
      updatePassword: vi.fn(),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
      refreshAccessToken: vi.fn().mockResolvedValue(null),
    };
    const runtime: AppRuntime = {
      account: accountApiStub(),
      auth,
      bookBuilder: bookBuilderAdminApiStub(),
      books: { getCatalog: vi.fn() },
      http: new AuthenticatedHttpClient({
        apiBaseUrl: "http://api.test",
        getAccessToken: async () => null,
      }),
      profile: {
        getProfile: vi.fn(),
        updateProfile: vi.fn(),
      },
      rooms: roomApiStub(),
      sessions: sessionApiStub(),
    };

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/private"]}>
          <AppRuntimeProvider runtime={runtime}>
            <AuthProvider>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/private" element={<p>보호된 내용</p>} />
                </Route>
                <Route path="/auth/login" element={<p>로그인 화면</p>} />
              </Routes>
            </AuthProvider>
          </AppRuntimeProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("로그인 상태를 확인하고 있습니다.");

    await act(async () => resolveUser?.(null));
    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
    expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
  });
});
