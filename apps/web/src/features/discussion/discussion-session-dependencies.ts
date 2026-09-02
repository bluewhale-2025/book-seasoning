import { getBrowserSupabaseClient } from "../../data/browser-supabase";
import { loadWebEnvironment } from "../../data/environment";
import { AuthenticatedHttpClient } from "../../data/http-client";
import { HttpRoomApi, type RoomApi } from "../../data/room-api";
import { HttpSessionApi, type SessionApi } from "../../data/session-api";
import {
  SupabaseSessionRealtimeClient,
  type SessionRealtimeClient,
} from "../../data/session-realtime";

export type DiscussionSessionDependencies = Readonly<{
  api: SessionApi;
  rooms: Pick<RoomApi, "getPrepEntries">;
  realtime: SessionRealtimeClient;
}>;

export function createBrowserDiscussionSessionDependencies(): DiscussionSessionDependencies {
  const environment = loadWebEnvironment();
  const supabase = getBrowserSupabaseClient(environment);
  const getAccessToken = async () => {
    const result = await supabase.auth.getSession();
    return result.data.session?.access_token ?? null;
  };
  const refreshAccessToken = async () => {
    const result = await supabase.auth.refreshSession();
    return result.data.session?.access_token ?? null;
  };
  const http = new AuthenticatedHttpClient({
    apiBaseUrl: environment.apiBaseUrl,
    getAccessToken,
    refreshAccessToken,
  });
  return {
    api: new HttpSessionApi(http),
    rooms: new HttpRoomApi(http),
    realtime: new SupabaseSessionRealtimeClient(supabase),
  };
}
