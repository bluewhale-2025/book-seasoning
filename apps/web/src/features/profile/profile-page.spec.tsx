import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import { AuthProvider } from "../../app/auth-provider";
import type { AuthApi } from "../../data/auth-api";
import type { AccountApi } from "../../data/account-api";
import { AuthenticatedHttpClient, HttpClientError } from "../../data/http-client";
import type { ProfileApi } from "../../data/profile-api";
import { accountApiStub, bookBuilderAdminApiStub, roomApiStub, sessionApiStub } from "../../test/runtime-stubs";
import { ProfilePage } from "./profile-page";

const user = {
  userId: "90000000-0000-4000-8000-000000000001",
  email: "reader@example.com",
};
const initialProfile = {
  userId: user.userId,
  profileName: "지윤",
  role: "USER" as const,
  updatedAt: "2026-09-02T10:00:00.000Z",
};

function createAuthApi(): AuthApi {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(user),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    signUp: vi.fn(),
    signIn: vi.fn(),
    requestPasswordReset: vi.fn(),
    exchangePasswordResetCode: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue("token"),
    refreshAccessToken: vi.fn().mockResolvedValue("token"),
  };
}

function renderProfile(profile: ProfileApi, account: AccountApi = accountApiStub(), auth: AuthApi = createAuthApi()) {
  const runtime: AppRuntime = {
    account,
    auth,
    bookBuilder: bookBuilderAdminApiStub(),
    books: { getCatalog: vi.fn() },
    profile,
    http: new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
    }),
    rooms: roomApiStub(),
    sessions: sessionApiStub(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppRuntimeProvider runtime={runtime}>
          <AuthProvider>
            <ProfilePage />
          </AuthProvider>
        </AppRuntimeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { auth, queryClient };
}

describe("ProfilePage", () => {
  it("keeps the saved name authoritative until the profile mutation succeeds", async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      ...initialProfile,
      profileName: "새 이름",
      updatedAt: "2026-09-02T10:10:00.000Z",
    });
    renderProfile({
      getProfile: vi.fn().mockResolvedValue(initialProfile),
      updateProfile,
    });
    const input = await screen.findByRole("textbox", { name: "프로필 이름" });
    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();

    const interaction = userEvent.setup();
    await interaction.clear(input);
    await interaction.type(input, "새 이름");
    expect(save).toBeEnabled();
    await interaction.click(save);

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ profileName: "새 이름" }));
    expect(await screen.findByText("프로필 이름을 저장했습니다.")).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it("rejects a whitespace-only profile name before calling the server", async () => {
    const updateProfile = vi.fn();
    renderProfile({
      getProfile: vi.fn().mockResolvedValue(initialProfile),
      updateProfile,
    });
    const input = await screen.findByRole("textbox", { name: "프로필 이름" });
    const interaction = userEvent.setup();
    await interaction.clear(input);
    await interaction.type(input, "   ");
    await interaction.tab();

    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("프로필 이름을 입력해 주세요.");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows blocker resolution without opening the password form", async () => {
    const interaction = userEvent.setup();
    renderProfile(
      { getProfile: vi.fn().mockResolvedValue(initialProfile), updateProfile: vi.fn() },
      accountApiStub({
        getDeletionPreview: vi.fn().mockResolvedValue({
          allowed: false,
          blockers: ["ACTIVE_PARTICIPATION", "HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL"],
          affected: { messages: 4, publicPrep: 1, privatePrep: 2, closingResponses: 1 },
        }),
      }),
    );

    await interaction.click(await screen.findByRole("button", { name: "계정 탈퇴" }));
    expect(await screen.findByText("지금은 탈퇴할 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("진행 중인 토론 참여")).toBeInTheDocument();
    expect(screen.getByText("예정된 토론의 방장")).toBeInTheDocument();
    expect(screen.queryByLabelText("현재 비밀번호")).not.toBeInTheDocument();
  });

  it("requires password and explicit confirmation before permanent deletion", async () => {
    const interaction = userEvent.setup();
    const deleteAccount = vi.fn().mockResolvedValue({
      deletionId: "c2000000-0000-4000-8000-000000000001",
      status: "COMPLETED",
      duplicate: false,
      serverTime: "2026-09-02T10:00:00.000Z",
    });
    const auth = createAuthApi();
    vi.mocked(auth.signOut).mockRejectedValue(new Error("Auth identity already deleted"));
    renderProfile(
      { getProfile: vi.fn().mockResolvedValue(initialProfile), updateProfile: vi.fn() },
      accountApiStub({
        getDeletionPreview: vi.fn().mockResolvedValue({
          allowed: true,
          blockers: [],
          affected: { messages: 18, publicPrep: 2, privatePrep: 1, closingResponses: 1 },
        }),
        deleteAccount,
      }),
      auth,
    );

    await interaction.click(await screen.findByRole("button", { name: "계정 탈퇴" }));
    expect(await screen.findByText("공동 기록 21개 유지")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "영구 탈퇴" });
    expect(submit).toBeDisabled();
    await interaction.type(screen.getByLabelText("현재 비밀번호"), "current-password");
    await interaction.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    await interaction.click(submit);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith(expect.objectContaining({ currentPassword: "current-password", confirmPermanentDeletion: true })));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
  });

  it("keeps the session and clears the password after a password error", async () => {
    const interaction = userEvent.setup();
    const deleteAccount = vi.fn().mockRejectedValue(new HttpClientError("CURRENT_PASSWORD_INVALID", 401, "현재 비밀번호를 확인해주세요."));
    const auth = createAuthApi();
    const { queryClient } = renderProfile(
      { getProfile: vi.fn().mockResolvedValue(initialProfile), updateProfile: vi.fn() },
      accountApiStub({
        getDeletionPreview: vi.fn().mockResolvedValue({
          allowed: true,
          blockers: [],
          affected: { messages: 0, publicPrep: 0, privatePrep: 0, closingResponses: 0 },
        }),
        deleteAccount,
      }),
      auth,
    );

    await interaction.click(await screen.findByRole("button", { name: "계정 탈퇴" }));
    const password = await screen.findByLabelText("현재 비밀번호");
    await interaction.type(password, "wrong-password");
    await interaction.click(screen.getByRole("checkbox"));
    await interaction.click(screen.getByRole("button", { name: "영구 탈퇴" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("현재 비밀번호가 맞지 않습니다.");
    expect(password).toHaveValue("");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});
