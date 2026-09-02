import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ProfileSchema } from "@bookseasoning/contracts/public";

import { HttpAccountApi } from "../../web/src/data/account-api.js";
import {
  AuthenticatedHttpClient,
  HttpClientError,
} from "../../web/src/data/http-client.js";

const profileName = "탈퇴 스모크";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(rawUrl: string): void {
  const hostname = new URL(rawUrl).hostname;
  assert(
    hostname === "localhost" || hostname === "127.0.0.1",
    "Local smoke refuses non-local services",
  );
}

function makeUserClient(supabaseUrl: string, publishableKey: string) {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function makeAccountAdapter(client: SupabaseClient, apiBaseUrl: string) {
  const http = new AuthenticatedHttpClient({
    apiBaseUrl,
    getAccessToken: async () =>
      (await client.auth.getSession()).data.session?.access_token ?? null,
  });

  return { account: new HttpAccountApi(http), http };
}

async function assertApiFoundation(apiBaseUrl: string): Promise<void> {
  for (const path of ["/health/live", "/health/ready"]) {
    const response = await fetch(`${apiBaseUrl}${path}`);
    assert(response.status === 200, `${path} did not return 200`);
  }

  const protectedResponse = await fetch(`${apiBaseUrl}/v1/me/profile`);
  assert(
    protectedResponse.status === 401,
    "Protected API did not reject a request without a token",
  );
}

async function run(): Promise<void> {
  assert(process.env.NODE_ENV !== "production", "Local smoke refuses production mode");

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  assert(supabaseUrl !== undefined, "SUPABASE_URL is required");
  assert(publishableKey !== undefined, "SUPABASE_PUBLISHABLE_KEY is required");
  assert(secretKey !== undefined, "SUPABASE_SECRET_KEY is required");
  assertLocalUrl(supabaseUrl);
  assertLocalUrl(apiBaseUrl);

  const email = `bookseasoning-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `Local-${randomUUID()}-9a!`;
  const createdUserIds = new Set<string>();
  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  try {
    await assertApiFoundation(apiBaseUrl);
    process.stdout.write("ok 1/9 API readiness and auth boundary\n");

    const firstClient = makeUserClient(supabaseUrl, publishableKey);
    const firstSignUp = await firstClient.auth.signUp({
      email,
      password,
      options: { data: { profile_name: profileName } },
    });
    if (firstSignUp.error !== null) throw firstSignUp.error;
    const firstUserId = firstSignUp.data.user?.id;
    assert(
      firstUserId !== undefined && firstSignUp.data.session !== null,
      "Initial signup did not return an authenticated user",
    );
    createdUserIds.add(firstUserId);
    process.stdout.write("ok 2/9 signup and auth session\n");

    const first = makeAccountAdapter(firstClient, apiBaseUrl);
    const profile = await first.http.request(
      "/v1/me/profile",
      { method: "GET" },
      ProfileSchema,
    );
    assert(
      profile.userId === firstUserId && profile.profileName === profileName,
      "Profile did not match signup metadata",
    );
    process.stdout.write("ok 3/9 frontend HTTP adapter profile parse\n");

    const preview = await first.account.getDeletionPreview();
    assert(
      preview.allowed && preview.blockers.length === 0,
      "Fresh account deletion should be allowed",
    );
    assert(
      Object.values(preview.affected).every((value) => value === 0),
      "Fresh account should have zero affected records",
    );
    process.stdout.write("ok 4/9 deletion preview contract\n");

    let invalidPasswordRejected = false;
    try {
      await first.account.deleteAccount({
        commandId: randomUUID(),
        currentPassword: `wrong-${randomUUID()}`,
        confirmPermanentDeletion: true,
      });
    } catch (error) {
      invalidPasswordRejected =
        error instanceof HttpClientError &&
        error.status === 401 &&
        error.code === "CURRENT_PASSWORD_INVALID";
    }
    assert(
      invalidPasswordRejected,
      "Wrong password was not rejected with the public error contract",
    );
    process.stdout.write("ok 5/9 current-password rejection\n");

    const deletion = await first.account.deleteAccount({
      commandId: randomUUID(),
      currentPassword: password,
      confirmPermanentDeletion: true,
    });
    assert(deletion.status === "COMPLETED", "Account deletion did not complete");
    createdUserIds.delete(firstUserId);
    process.stdout.write("ok 6/9 DB prepare and Auth hard delete\n");

    const oldLogin = await makeUserClient(
      supabaseUrl,
      publishableKey,
    ).auth.signInWithPassword({ email, password });
    assert(
      oldLogin.error !== null && oldLogin.data.user === null,
      "Deleted identity can still sign in",
    );
    process.stdout.write("ok 7/9 deleted identity cannot sign in\n");

    const secondClient = makeUserClient(supabaseUrl, publishableKey);
    const secondSignUp = await secondClient.auth.signUp({
      email,
      password,
      options: { data: { profile_name: `${profileName} 재가입` } },
    });
    if (secondSignUp.error !== null) throw secondSignUp.error;
    const secondUserId = secondSignUp.data.user?.id;
    assert(
      secondUserId !== undefined && secondSignUp.data.session !== null,
      "Re-signup did not return an authenticated user",
    );
    assert(secondUserId !== firstUserId, "Re-signup reused the deleted Auth UUID");
    createdUserIds.add(secondUserId);
    process.stdout.write("ok 8/9 same email re-signup has a new identity\n");

    const second = makeAccountAdapter(secondClient, apiBaseUrl);
    const secondPreview = await second.account.getDeletionPreview();
    assert(secondPreview.allowed, "Rejoined account cleanup deletion is blocked");
    const cleanup = await second.account.deleteAccount({
      commandId: randomUUID(),
      currentPassword: password,
      confirmPermanentDeletion: true,
    });
    assert(cleanup.status === "COMPLETED", "Rejoined account cleanup failed");
    createdUserIds.delete(secondUserId);

    const finalLogin = await makeUserClient(
      supabaseUrl,
      publishableKey,
    ).auth.signInWithPassword({ email, password });
    assert(
      finalLogin.error !== null && finalLogin.data.user === null,
      "Cleanup identity can still sign in",
    );
    process.stdout.write("ok 9/9 sacrificial account cleanup\n");
    process.stdout.write("account deletion local smoke: PASS\n");
  } finally {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId, false);
    }
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`account deletion local smoke: FAIL (${message})\n`);
  process.exitCode = 1;
});
