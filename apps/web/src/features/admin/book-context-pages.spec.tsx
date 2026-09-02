import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import { AuthenticatedHttpClient } from "../../data/http-client";
import { accountApiStub, bookBuilderAdminApiStub, roomApiStub, sessionApiStub } from "../../test/runtime-stubs";
import { createBookContextPackSnapshot } from "../../test/book-builder-fixture";
import { AdminRoute } from "./admin-route";
import { BookContextPackListPage } from "./book-context-pack-list-page";
import { BookContextPackPage } from "./book-context-pack-page";

const userId = "b2000000-0000-4000-8000-000000000001";

function runtime(overrides: Partial<AppRuntime> = {}): AppRuntime {
  return {
    account: accountApiStub(),
    auth: {
      getCurrentUser: vi.fn(), subscribe: vi.fn().mockReturnValue(() => undefined), signUp: vi.fn(), signIn: vi.fn(), requestPasswordReset: vi.fn(), exchangePasswordResetCode: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(), getAccessToken: vi.fn(), refreshAccessToken: vi.fn(),
    },
    bookBuilder: bookBuilderAdminApiStub(),
    books: { getCatalog: vi.fn() },
    http: new AuthenticatedHttpClient({ apiBaseUrl: "http://api.test", getAccessToken: async () => "token" }),
    profile: { getProfile: vi.fn().mockResolvedValue({ userId, profileName: "관리자", role: "ADMIN", updatedAt: "2026-09-02T10:00:00.000Z" }), updateProfile: vi.fn() },
    rooms: roomApiStub(),
    sessions: sessionApiStub(),
    ...overrides,
  };
}

function renderWithRuntime(element: React.ReactNode, appRuntime: AppRuntime, initialEntry = "/admin/book-context") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><AppRuntimeProvider runtime={appRuntime}>{element}</AppRuntimeProvider></MemoryRouter></QueryClientProvider>);
}

describe("Book Context admin pages", () => {
  it("keeps the admin route hidden from a normal member", async () => {
    const appRuntime = runtime({ profile: { getProfile: vi.fn().mockResolvedValue({ userId, profileName: "독자", role: "USER", updatedAt: "2026-09-02T10:00:00.000Z" }), updateProfile: vi.fn() } });
    renderWithRuntime(<Routes><Route element={<AdminRoute />}><Route path="/admin/book-context" element={<p>관리 화면</p>} /></Route><Route path="/discussions" element={<p>내 토론 화면</p>} /></Routes>, appRuntime);
    expect(await screen.findByText("내 토론 화면")).toBeInTheDocument();
    expect(screen.queryByText("관리 화면")).not.toBeInTheDocument();
  });

  it("shows recent Packs and starts a new Builder run", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    const createPack = vi.fn().mockResolvedValue({ packVersionId: snapshot.pack.packVersionId, status: "DRAFT", revision: 0, run: snapshot.pack.builderRun, duplicate: false, serverTime: snapshot.pack.updatedAt });
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ listPacks: vi.fn().mockResolvedValue([snapshot.pack]), createPack }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context" element={<BookContextPackListPage />} /><Route path="/admin/book-context/:packVersionId" element={<p>Pack 상세</p>} /></Routes>, appRuntime);

    expect(await screen.findByRole("heading", { name: "데미안" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새 Pack" }));
    await user.type(screen.getByLabelText("책 제목"), "변신");
    await user.type(screen.getByLabelText("저자"), "프란츠 카프카");
    await user.click(screen.getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(createPack).toHaveBeenCalledWith(expect.objectContaining({ title: "변신", author: "프란츠 카프카" })));
    expect(await screen.findByText("Pack 상세")).toBeInTheDocument();
  });

  it("autosaves a Draft with its current revision", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    const getPack = vi.fn().mockResolvedValue(snapshot);
    const updateDraft = vi.fn().mockResolvedValue({ packVersionId: snapshot.pack.packVersionId, status: "DRAFT", revision: 4, duplicate: false, serverTime: snapshot.pack.updatedAt });
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack, updateDraft, listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    const description = await screen.findByLabelText("짧은 소개");
    await user.clear(description);
    await user.type(description, "새로운 소개");
    await waitFor(() => expect(updateDraft).toHaveBeenCalledWith(snapshot.pack.packVersionId, expect.objectContaining({ expectedRevision: 3, draft: expect.objectContaining({ shortDescription: "새로운 소개" }) })), { timeout: 2_500 });
  });
});
