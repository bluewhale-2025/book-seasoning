const forbiddenPublicKeyFragments = [
  "ai_private",
  "aiprivate",
  "password",
  "privateprompt",
  "llmprompt",
  "providerprompt",
  "promptbody",
  "prompttext",
  "providerresponse",
  "secret",
  "token",
] as const;

export class PublicPayloadPrivacyError extends Error {
  public constructor() {
    super("Public payload contains a forbidden field");
    this.name = "PublicPayloadPrivacyError";
  }
}

function normalizeKey(key: string): string {
  return key.replaceAll(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

export function assertPublicPayloadKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertPublicPayloadKeys);
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (forbiddenPublicKeyFragments.some((fragment) => normalizedKey.includes(fragment))) {
      throw new PublicPayloadPrivacyError();
    }

    assertPublicPayloadKeys(nestedValue);
  }
}
