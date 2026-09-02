import { z } from "zod";

export const WorkerHeartbeatSchema = z.strictObject({
  runtime: z.literal("worker"),
  release: z.string().min(1).max(128),
  occurredAt: z.iso.datetime(),
});

export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;
