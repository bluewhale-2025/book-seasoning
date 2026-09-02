import { z } from "zod";

export const AccountDeletionBlockerSchema = z.enum([
  "ADMIN_ROLE",
  "ACTIVE_PARTICIPATION",
  "HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL",
]);
export const AccountDeletionPreviewSchema = z.strictObject({
  allowed: z.boolean(),
  blockers: z.array(AccountDeletionBlockerSchema).max(3),
  affected: z.strictObject({
    messages: z.int().nonnegative(),
    publicPrep: z.int().nonnegative(),
    privatePrep: z.int().nonnegative(),
    closingResponses: z.int().nonnegative(),
  }),
});
export const DeleteAccountRequestSchema = z.strictObject({
  commandId: z.uuid(),
  currentPassword: z.string().min(1).max(256),
  confirmPermanentDeletion: z.literal(true),
});
export const DeleteAccountResponseSchema = z.strictObject({
  deletionId: z.uuid(),
  status: z.literal("COMPLETED"),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});

export type AccountDeletionPreview = z.infer<typeof AccountDeletionPreviewSchema>;
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
