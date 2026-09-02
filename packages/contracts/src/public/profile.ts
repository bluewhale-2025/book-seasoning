import { z } from "zod";

export const ProfileNameSchema = z.string().trim().min(1);
export const ProfileRoleSchema = z.enum(["USER", "ADMIN"]);

export const ProfileSchema = z.strictObject({
  userId: z.uuid(),
  profileName: ProfileNameSchema,
  role: ProfileRoleSchema,
  updatedAt: z.iso.datetime(),
});

export const UpdateProfileRequestSchema = z.strictObject({
  profileName: ProfileNameSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
