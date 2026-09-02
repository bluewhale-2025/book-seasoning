import { createHmac } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function createCommandFingerprint(
  key: string,
  commandType: string,
  payload: unknown,
): string {
  return createHmac("sha256", key)
    .update(commandType)
    .update("\n")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}
