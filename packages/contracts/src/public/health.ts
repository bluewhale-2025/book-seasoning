import { z } from "zod";

export const RuntimeKindSchema = z.enum(["api", "worker"]);

export const HealthStatusSchema = z.strictObject({
  status: z.enum(["ok", "not_ready"]),
  service: z.literal("bookseasoning"),
  runtime: RuntimeKindSchema,
  release: z.string().min(1).max(128),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;
