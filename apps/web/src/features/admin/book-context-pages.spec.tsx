import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AdminBookContextPackSnapshot } from "@bookseasoning/contracts/admin";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import { TooltipProvider } from "../../components/ui/tooltip";
import { AuthenticatedHttpClient, HttpClientError } from "../../data/http-client";
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
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><AppRuntimeProvider runtime={appRuntime}><TooltipProvider>{element}</TooltipProvider></AppRuntimeProvider></MemoryRouter></QueryClientProvider>);
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
    const selectionProof = "signed-selection-proof";
    const searchBooks = vi.fn().mockResolvedValue({
      query: "변신",
      page: 1,
      isEnd: true,
      results: [{ provider: "KAKAO", externalBookId: "isbn13:9788954600208", title: "변신", authors: ["프란츠 카프카"], translators: ["홍길동"], publisher: "출판사", publishedDate: "2024-01-01", isbn10: null, isbn13: "9788954600208", thumbnailUrl: null, description: null, detailUrl: null, selectionProof }],
    });
    const createPack = vi.fn().mockResolvedValue({ packVersionId: snapshot.pack.packVersionId, status: "DRAFT", revision: 0, run: snapshot.pack.builderRun, outcome: "CREATED", duplicate: false, serverTime: snapshot.pack.updatedAt });
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ listPacks: vi.fn().mockResolvedValue([snapshot.pack]), searchBooks, createPack }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context" element={<BookContextPackListPage />} /><Route path="/admin/book-context/:packVersionId" element={<p>Pack 상세</p>} /></Routes>, appRuntime);

    expect(await screen.findByRole("heading", { name: "데미안" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새 Pack" }));
    await user.type(screen.getByLabelText("책 검색"), "변신");
    await user.click(screen.getByRole("button", { name: "검색" }));
    await user.click(await screen.findByRole("button", { name: /변신/ }));
    await user.click(screen.getByRole("button", { name: "이 책으로 Pack 만들기" }));
    await waitFor(() => expect(createPack).toHaveBeenCalledWith(expect.objectContaining({ selectionProof })));
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

  it("stops autosave retries after a revision conflict", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    const updateDraft = vi.fn().mockRejectedValue(new HttpClientError(
      "BOOK_BUILDER_REVISION_CONFLICT",
      409,
      "다른 변경이 먼저 저장되었습니다.",
    ));
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack: vi.fn().mockResolvedValue(snapshot), updateDraft, listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    const description = await screen.findByLabelText("짧은 소개");
    await user.clear(description);
    await user.type(description, "충돌한 소개");

    expect(await screen.findByText("저장 실패", {}, { timeout: 2_500 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최신 상태 불러오기" })).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(updateDraft).toHaveBeenCalledTimes(1);
  });

  it("excludes an untouched added item when another change is saved", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    const originalItemCount = snapshot.draft.sections.reduce((sum, section) => sum + section.items.length, 0);
    const updateDraft = vi.fn().mockResolvedValue({ packVersionId: snapshot.pack.packVersionId, status: "DRAFT", revision: 4, duplicate: false, serverTime: snapshot.pack.updatedAt });
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack: vi.fn().mockResolvedValue(snapshot), updateDraft, listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    const description = await screen.findByLabelText("짧은 소개");
    await user.click(screen.getAllByRole("button", { name: "항목 추가" })[0]!);
    await user.clear(description);
    await user.type(description, "빈 항목을 제외한 소개");

    await waitFor(() => expect(updateDraft).toHaveBeenCalled(), { timeout: 2_500 });
    const savedDraft = updateDraft.mock.calls[0]![1].draft as AdminBookContextPackSnapshot["draft"];
    expect(savedDraft.sections.reduce((sum, section) => sum + section.items.length, 0)).toBe(originalItemCount);
    expect(savedDraft.sections.flatMap((section) => section.items).some((item) => item.title === "" || item.content === "")).toBe(false);
  });

  it("waits to save a partially written new item until required fields are complete", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    const updateDraft = vi.fn();
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack: vi.fn().mockResolvedValue(snapshot), updateDraft, listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    await screen.findByLabelText("짧은 소개");
    await user.click(screen.getAllByRole("button", { name: "항목 추가" })[0]!);
    const emptyTitle = screen.getAllByPlaceholderText("항목 제목").find((input) => (input as HTMLInputElement).value === "");
    expect(emptyTitle).toBeDefined();
    await user.type(emptyTitle!, "작성 중인 항목");

    expect(await screen.findByText("필수 항목 입력 필요", {}, { timeout: 2_500 })).toBeInTheDocument();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("hides review guidance until the Builder run succeeds", async () => {
    const snapshot = createBookContextPackSnapshot();
    snapshot.pack.builderRun!.status = "RUNNING";
    snapshot.pack.builderRun!.stage = "BUILD_SECTIONS";
    snapshot.pack.builderRun!.completedStageCount = 5;
    snapshot.validation.hardBlockers = ["PACK_EMPTY"];
    snapshot.validation.warnings = ["SECTION_COVERAGE_INCOMPLETE"];
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack: vi.fn().mockResolvedValue(snapshot), listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    expect(await screen.findByRole("heading", { name: "Builder" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "검수 안내" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("짧은 소개")).toBeDisabled();
    expect(screen.getByText("Builder 생성 중에는 revision 충돌을 막기 위해 편집할 수 없습니다.")).toBeInTheDocument();
  });

  it("acknowledges warnings once when completing the whole Pack review", async () => {
    const user = userEvent.setup();
    const snapshot = createBookContextPackSnapshot();
    snapshot.validation.warnings = ["LIMITED_OR_INSUFFICIENT_EVIDENCE", "SOURCE_UNAVAILABLE"];
    const requestReview = vi.fn().mockResolvedValue({ packVersionId: snapshot.pack.packVersionId, status: "REVIEW", revision: 4, duplicate: false, serverTime: snapshot.pack.updatedAt });
    const appRuntime = runtime({ bookBuilder: bookBuilderAdminApiStub({ getPack: vi.fn().mockResolvedValue(snapshot), requestReview, listPacks: vi.fn().mockResolvedValue([]) }) });
    renderWithRuntime(<Routes><Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} /></Routes>, appRuntime, `/admin/book-context/${snapshot.pack.packVersionId}`);

    expect(await screen.findByRole("heading", { name: "검수 안내" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "전체 검수 완료" }));
    await user.click(screen.getByLabelText("표시된 확인 필요 항목을 모두 확인했습니다."));
    await user.click(screen.getAllByRole("button", { name: "전체 검수 완료" }).at(-1)!);

    await waitFor(() => expect(requestReview).toHaveBeenCalledWith(snapshot.pack.packVersionId, expect.objectContaining({
      expectedRevision: 3,
      acknowledgedWarnings: snapshot.validation.warnings,
    })));
  });
});
