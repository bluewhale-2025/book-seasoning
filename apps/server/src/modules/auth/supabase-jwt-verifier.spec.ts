import { describe, expect, it } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { SupabaseJwtVerifier } from "./supabase-jwt-verifier.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test-release",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
  supabaseUrl: "https://project.example.test",
  supabasePublishableKey: "sb_publishable_test",
};

async function signingFixture() {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);
  const keyId = "test-key";
  const resolver = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "ES256", kid: keyId, use: "sig" }],
  });
  const sign = (audience: string) =>
    new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer("https://project.example.test/auth/v1")
      .setAudience(audience)
      .setSubject("10000000-0000-4000-8000-000000000001")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  return { resolver, sign };
}

describe("SupabaseJwtVerifier", () => {
  it("accepts a signed authenticated-user token", async () => {
    const { resolver, sign } = await signingFixture();
    const verifier = new SupabaseJwtVerifier(environment, resolver);
    const token = await sign("authenticated");

    await expect(verifier.verify(token)).resolves.toEqual({
      userId: "10000000-0000-4000-8000-000000000001",
      accessToken: token,
    });
  });

  it("rejects a token for another audience", async () => {
    const { resolver, sign } = await signingFixture();
    const verifier = new SupabaseJwtVerifier(environment, resolver);

    await expect(verifier.verify(await sign("other-service"))).rejects.toThrow();
  });
});
