import * as React from "react";

import { HttpAccountApi, type AccountApi } from "../data/account-api";
import { SupabaseAuthApi, type AuthApi } from "../data/auth-api";
import { HttpBookApi, type BookApi } from "../data/book-api";
import { HttpBookBuilderAdminApi, type BookBuilderAdminApi } from "../data/book-builder-admin-api";
import { getBrowserSupabaseClient } from "../data/browser-supabase";
import { loadWebEnvironment, WebEnvironmentError } from "../data/environment";
import { AuthenticatedHttpClient } from "../data/http-client";
import { HttpProfileApi, type ProfileApi } from "../data/profile-api";
import { HttpRoomApi, type RoomApi } from "../data/room-api";
import { HttpSessionApi, type SessionApi } from "../data/session-api";

export type AppRuntime = Readonly<{
  account: AccountApi;
  auth: AuthApi;
  bookBuilder: BookBuilderAdminApi;
  books: BookApi;
  http: AuthenticatedHttpClient;
  profile: ProfileApi;
  rooms: RoomApi;
  sessions: SessionApi;
}>;

const AppRuntimeContext = React.createContext<AppRuntime | null>(null);

export function createBrowserAppRuntime(): AppRuntime {
  const environment = loadWebEnvironment();
  const auth = new SupabaseAuthApi(getBrowserSupabaseClient(environment));
  const http = new AuthenticatedHttpClient({
    apiBaseUrl: environment.apiBaseUrl,
    getAccessToken: () => auth.getAccessToken(),
    refreshAccessToken: () => auth.refreshAccessToken(),
    onAuthRequired: () => auth.signOut().catch(() => undefined),
  });
  return {
    account: new HttpAccountApi(http),
    auth,
    bookBuilder: new HttpBookBuilderAdminApi(http),
    books: new HttpBookApi(http),
    http,
    profile: new HttpProfileApi(http),
    rooms: new HttpRoomApi(http),
    sessions: new HttpSessionApi(http),
  };
}

export function AppRuntimeProvider({
  runtime,
  children,
}: Readonly<{ runtime: AppRuntime; children: React.ReactNode }>) {
  return <AppRuntimeContext.Provider value={runtime}>{children}</AppRuntimeContext.Provider>;
}

export function BrowserRuntimeBoundary({ children }: Readonly<{ children: React.ReactNode }>) {
  const [result] = React.useState<
    Readonly<{ runtime: AppRuntime }> | Readonly<{ error: unknown }>
  >(() => {
    try {
      return { runtime: createBrowserAppRuntime() };
    } catch (error) {
      return { error };
    }
  });

  if ("error" in result) {
    const missing =
      result.error instanceof WebEnvironmentError
        ? result.error.fields.join(", ")
        : "browser configuration";
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <section className="w-full max-w-lg rounded-xl border border-border bg-surface-elevated p-6">
          <h1 className="text-section-title m-0">연결 설정이 필요합니다</h1>
          <p className="text-body mb-0 text-muted-foreground">누락된 공개 설정: {missing}</p>
        </section>
      </main>
    );
  }

  return <AppRuntimeProvider runtime={result.runtime}>{children}</AppRuntimeProvider>;
}

export function useAppRuntime(): AppRuntime {
  const runtime = React.useContext(AppRuntimeContext);
  if (runtime === null) throw new Error("AppRuntimeProvider is missing");
  return runtime;
}
