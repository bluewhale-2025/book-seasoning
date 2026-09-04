import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  SupabaseDependencyUnavailableException,
  rethrowSupabaseDependencyError,
  supabaseRpcErrorCode,
} from "./supabase-error.js";

describe("Supabase dependency errors", () => {
  it("classifies PostgREST's stale JWT clock failure as unavailable", () => {
    expect(() =>
      rethrowSupabaseDependencyError({
        code: "PGRST303",
        message: "JWT issued at future",
      }),
    ).toThrow(SupabaseDependencyUnavailableException);

    try {
      rethrowSupabaseDependencyError({
        code: "PGRST303",
        message: "JWT issued at future",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseDependencyUnavailableException);
      expect((error as SupabaseDependencyUnavailableException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(
        (error as SupabaseDependencyUnavailableException).dependencyCode,
      ).toBe("SUPABASE_POSTGREST_JWT_TIME_STALE");
    }
  });

  it("preserves database domain codes and fallback behavior", () => {
    expect(
      supabaseRpcErrorCode({ message: "room_capacity_reached" }, "room_failed"),
    ).toBe("room_capacity_reached");
    expect(
      supabaseRpcErrorCode(
        { code: "PGRST303", message: "different authentication failure" },
        "room_failed",
      ),
    ).toBe("room_failed");
  });
});
