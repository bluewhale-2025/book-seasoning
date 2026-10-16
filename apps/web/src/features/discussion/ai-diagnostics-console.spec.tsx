import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAiDiagnosticsFixture } from "../../test/ai-diagnostics-fixture";
import { HttpClientError } from "../../data/http-client";
import { AiDiagnosticsConsole } from "./ai-diagnostics-console";

const mocks = vi.hoisted(() => ({ request: vi.fn(), role: "ADMIN" }));
vi.mock("../../app/app-runtime", () => ({ useAppRuntime: () => ({ http: mocks }) }));
vi.mock("../profile/profile-query", () => ({ useProfileQuery: () => ({ data: { role: mocks.role } }) }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.request.mockReset(); mocks.role = "ADMIN"; });

describe("AI state console", () => {
  it("polls and logs even when awaiting a participant, then stops on unmount", async () => {
    vi.useFakeTimers();
    const state = createAiDiagnosticsFixture();
    mocks.request.mockImplementation(async (_path, _init, schema) => schema.parse(state));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const view = render(<AiDiagnosticsConsole roomId="room" />);
    await act(async () => {});
    expect(log).toHaveBeenCalledWith("[AI state]", expect.objectContaining({ awaitingParticipantResponse: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("never requests diagnostics for an ordinary participant", async () => {
    mocks.role = "USER";
    render(<AiDiagnosticsConsole roomId="room" />);
    await act(async () => {});
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects unexpected private fields and never logs the payload", async () => {
    const payload = { ...createAiDiagnosticsFixture(), privateBody: "AI_PRIVATE_CANARY" };
    mocks.request.mockImplementation(async (_path, _init, schema) => schema.parse(payload));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const view = render(<AiDiagnosticsConsole roomId="room" />);
    await act(async () => {});
    expect(log).toHaveBeenCalledWith("[AI state]", { status: "UNAVAILABLE", code: "DIAGNOSTICS_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("CANARY");
    view.unmount();
  });

  it("stops after permission is revoked and does not print raw errors", async () => {
    vi.useFakeTimers();
    mocks.request.mockRejectedValue(new HttpClientError("FORBIDDEN", 403, "PRIVATE_CANARY"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const view = render(<AiDiagnosticsConsole roomId="room" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("CANARY");
    view.unmount();
  });
});
