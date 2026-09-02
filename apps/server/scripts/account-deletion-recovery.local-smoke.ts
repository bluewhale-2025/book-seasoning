import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

import { createCommandFingerprint } from "../src/application/command-fingerprint.js";
import { loadEnvironment } from "../src/config/environment.js";
import { recoverPendingAccountDeletions } from "../src/modules/account/account-deletion-recovery.js";
import { SafeLogger } from "../src/observability/safe-logger.js";

type DeletionRow = Readonly<{
  attempt_count: number;
  completed_at: Date | null;
  error_code: string | null;
  status: string;
}>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(rawUrl: string, label: string): void {
  const hostname = new URL(rawUrl).hostname;
  assert(
    hostname === "localhost" || hostname === "127.0.0.1",
    `${label} must point to a local service`,
  );
}

async function deletionRow(database: Client, deletionId: string): Promise<DeletionRow> {
  const result = await database.query<DeletionRow>(
    `select status,attempt_count,error_code,completed_at
       from private.account_deletion_requests where id=$1`,
    [deletionId],
  );
  assert(result.rowCount === 1, "Account deletion request was not persisted");
  const row = result.rows[0];
  assert(row !== undefined, "Account deletion request row is missing");
  return row;
}

async function waitForCompletion(database: Client, deletionId: string): Promise<DeletionRow> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const row = await deletionRow(database, deletionId);
    if (row.status === "COMPLETED") return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker did not complete the expired account deletion lease");
}

async function run(): Promise<void> {
  assert(process.env.NODE_ENV !== "production", "Local smoke refuses production mode");
  const environment = loadEnvironment("worker");
  const {
    commandFingerprintKey,
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseUrl,
    workerDatabaseUrl,
  } = environment;
  assert(supabaseUrl !== undefined, "SUPABASE_URL is required");
  assert(supabasePublishableKey !== undefined, "SUPABASE_PUBLISHABLE_KEY is required");
  assert(supabaseSecretKey !== undefined, "SUPABASE_SECRET_KEY is required");
  assert(workerDatabaseUrl !== undefined, "WORKER_DATABASE_URL is required");
  assertLocalUrl(supabaseUrl, "SUPABASE_URL");
  assertLocalUrl(workerDatabaseUrl, "WORKER_DATABASE_URL");

  const email = `bookseasoning-recovery-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `Local-${randomUUID()}-9a!`;
  const commandId = randomUUID();
  const createdUserIds = new Set<string>();
  let deletionId: string | undefined;

  const admin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const userClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const database = new Client({ connectionString: workerDatabaseUrl });
  await database.connect();

  try {
    const signup = await userClient.auth.signUp({
      email,
      password,
      options: { data: { profile_name: "복구 스모크" } },
    });
    if (signup.error !== null) throw signup.error;
    const userId = signup.data.user?.id;
    assert(userId !== undefined && signup.data.session !== null, "Signup did not create a session");
    createdUserIds.add(userId);
    process.stdout.write("ok 1/7 sacrificial account created\n");

    const prepared = await userClient.rpc("prepare_account_deletion", {
      p_command_id: commandId,
      p_request_fingerprint: createCommandFingerprint(
        commandFingerprintKey,
        "DELETE_ACCOUNT",
        { userId, commandId, confirmPermanentDeletion: true },
      ),
    });
    if (prepared.error !== null) throw prepared.error;
    assert(
      prepared.data !== null &&
        typeof prepared.data === "object" &&
        "deletionId" in prepared.data &&
        typeof prepared.data.deletionId === "string",
      "Prepare did not return a deletion id",
    );
    const preparedDeletionId = prepared.data.deletionId;
    deletionId = preparedDeletionId;
    const preparedRow = await deletionRow(database, preparedDeletionId);
    assert(
      preparedRow.status === "PROCESSING" && preparedRow.attempt_count === 1,
      "Prepare did not create the initial processing lease",
    );
    process.stdout.write("ok 2/7 database preparation committed\n");

    const authBeforeRecovery = await admin.auth.admin.getUserById(userId);
    assert(
      authBeforeRecovery.error === null && authBeforeRecovery.data.user.id === userId,
      "Fault boundary did not preserve the Auth identity",
    );
    process.stdout.write("ok 3/7 simulated crash left Auth identity intact\n");

    const expired = await database.query(
      `update private.account_deletion_requests
          set lease_expires_at=timezone('utc',now())-interval '1 second',
              updated_at=timezone('utc',now())
        where id=$1 and status='PROCESSING'`,
      [preparedDeletionId],
    );
    assert(expired.rowCount === 1, "Could not expire the interrupted deletion lease");
    process.stdout.write("ok 4/7 interrupted lease made recoverable\n");

    await recoverPendingAccountDeletions(
      environment,
      new SafeLogger(environment),
    );
    const completed = await waitForCompletion(database, preparedDeletionId);
    assert(
      completed.attempt_count === 2 &&
        completed.error_code === null &&
        completed.completed_at !== null,
      "Recovery did not record a clean second attempt",
    );
    process.stdout.write("ok 5/7 worker reclaimed and completed the deletion\n");

    const deletedIdentity = await admin.auth.admin.getUserById(userId);
    assert(deletedIdentity.error !== null, "Recovered Auth identity still exists");
    createdUserIds.delete(userId);
    const oldLogin = await createClient(supabaseUrl, supabasePublishableKey).auth
      .signInWithPassword({ email, password });
    assert(oldLogin.error !== null, "Recovered identity can still sign in");
    process.stdout.write("ok 6/7 recovered identity cannot authenticate\n");

    const rejoined = await createClient(supabaseUrl, supabasePublishableKey).auth.signUp({
      email,
      password,
      options: { data: { profile_name: "복구 스모크 재가입" } },
    });
    if (rejoined.error !== null) throw rejoined.error;
    const rejoinedUserId = rejoined.data.user?.id;
    assert(
      rejoinedUserId !== undefined && rejoinedUserId !== userId,
      "Same-email re-signup did not create a fresh identity",
    );
    createdUserIds.add(rejoinedUserId);
    process.stdout.write("ok 7/7 same email creates a fresh identity\n");
    process.stdout.write("account deletion recovery local smoke: PASS\n");
  } finally {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId, false);
    }
    if (deletionId !== undefined) {
      await database.query(
        "delete from private.account_deletion_requests where id=$1",
        [deletionId],
      );
    }
    await database.end();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`account deletion recovery local smoke: FAIL (${message})\n`);
  process.exitCode = 1;
});
