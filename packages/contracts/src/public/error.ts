import { z } from "zod";

export const PublicErrorSchema = z.strictObject({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  message: z.string().min(1).max(300),
  requestId: z.uuid().optional(),
  aggregateVersion: z.int().nonnegative().optional(),
});

export type PublicError = z.infer<typeof PublicErrorSchema>;
