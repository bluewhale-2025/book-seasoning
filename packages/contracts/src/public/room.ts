import { z } from "zod";

export const RoomPasswordSchema = z.string().min(4).max(20);
export const RoomDisplayStatusSchema = z.enum([
  "SCHEDULED",
  "WAITING",
  "DISCUSSING",
  "EXTENDED",
  "CLOSING",
]);
export const RoomAvailabilitySchema = z.enum(["OPEN", "FULL"]);
export const RoomMembershipStatusSchema = z.enum([
  "REGISTERED",
  "PARTICIPATED",
  "CANCELED",
  "CANCELED_BY_ROOM",
  "REMOVED",
  "NO_SHOW",
]);
export const RoomLifecycleStatusSchema = z.enum([
  "SCHEDULED",
  "WAITING",
  "DISCUSSING",
  "EXTENDED",
  "CLOSING",
  "ENDED",
  "CANCELED",
]);
export const RoomActorRoleSchema = z.enum(["HOST", "PARTICIPANT", "NONE"]);

export const CreateRoomRequestSchema = z.strictObject({
  commandId: z.uuid(),
  payload: z.strictObject({
    title: z.string().trim().min(1),
    packVersionId: z.uuid(),
    scheduledStartAt: z.iso.datetime({ offset: true }),
    password: RoomPasswordSchema,
    minParticipants: z.int().min(2).max(15),
    maxParticipants: z.int().min(2).max(15),
  }),
}).superRefine((request, context) => {
  if (request.payload.minParticipants > request.payload.maxParticipants) {
    context.addIssue({
      code: "custom",
      message: "minParticipants must not exceed maxParticipants",
      path: ["payload", "minParticipants"],
    });
  }
});

export const CreateRoomResponseSchema = z.strictObject({
  roomId: z.uuid(),
  aggregateVersion: z.int().positive(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const RoomCommandResponseSchema = z.strictObject({
  roomId: z.uuid(),
  aggregateVersion: z.int().positive(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const JoinRoomRequestSchema = z.strictObject({
  commandId: z.uuid(),
  payload: z.strictObject({
    password: RoomPasswordSchema.optional(),
  }),
});

export const JoinRoomResponseSchema = RoomCommandResponseSchema.extend({
  membershipStatus: z.enum(["REGISTERED", "PARTICIPATED"]),
  participantCount: z.int().positive(),
});

export const UpdateRoomRequestSchema = z
  .strictObject({
    commandId: z.uuid(),
    expectedVersion: z.int().positive(),
    payload: z.strictObject({
      title: z.string().trim().min(1).optional(),
      packVersionId: z.uuid().optional(),
      scheduledStartAt: z.iso.datetime({ offset: true }).optional(),
      password: RoomPasswordSchema.optional(),
      minParticipants: z.int().min(2).max(15).optional(),
      maxParticipants: z.int().min(2).max(15).optional(),
    }),
  })
  .superRefine((request, context) => {
    if (Object.keys(request.payload).length === 0) {
      context.addIssue({
        code: "custom",
        message: "at least one room setting is required",
        path: ["payload"],
      });
    }
    const { minParticipants, maxParticipants } = request.payload;
    if (
      minParticipants !== undefined &&
      maxParticipants !== undefined &&
      minParticipants > maxParticipants
    ) {
      context.addIssue({
        code: "custom",
        message: "minParticipants must not exceed maxParticipants",
        path: ["payload", "minParticipants"],
      });
    }
  });

const EmptyRoomCommandPayloadSchema = z.strictObject({});

export const CancelMembershipRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedVersion: z.int().positive(),
  payload: EmptyRoomCommandPayloadSchema,
});

export const CancelRoomRequestSchema = CancelMembershipRequestSchema;

export const TransferHostRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedVersion: z.int().positive(),
  payload: z.strictObject({ targetUserId: z.uuid() }),
});

export const RemoveRoomMemberRequestSchema = TransferHostRequestSchema;

export const RoomSearchQuerySchema = z.strictObject({
  query: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const RoomSummarySchema = z.strictObject({
  roomId: z.uuid(),
  title: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  displayStatus: RoomDisplayStatusSchema,
  availability: RoomAvailabilitySchema,
  participantCount: z.int().nonnegative(),
  maxParticipants: z.int().min(2).max(15),
  hostProfileName: z.string().min(1),
  packVersionId: z.uuid(),
  bookTitle: z.string().min(1),
  bookAuthor: z.string().min(1),
  bookCoverUrl: z.url().nullable(),
});

export const RoomSearchResponseSchema = z.strictObject({
  items: z.array(RoomSummarySchema).max(50),
});

export const RoomMemberSchema = z.strictObject({
  userId: z.uuid(),
  profileName: z.string().min(1),
  membershipStatus: z.enum(["REGISTERED", "PARTICIPATED"]),
  isHost: z.boolean(),
});

export const RoomDetailSchema = z.strictObject({
  roomId: z.uuid(),
  aggregateVersion: z.int().positive(),
  title: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  displayStatus: RoomLifecycleStatusSchema,
  availability: RoomAvailabilitySchema,
  participantCount: z.int().nonnegative(),
  minParticipants: z.int().min(2).max(15),
  maxParticipants: z.int().min(2).max(15),
  actorRole: RoomActorRoleSchema,
  membershipStatus: RoomMembershipStatusSchema.nullable(),
  packVersionId: z.uuid(),
  bookTitle: z.string().min(1),
  bookAuthor: z.string().min(1),
  bookCoverUrl: z.url().nullable(),
  members: z.array(RoomMemberSchema),
});

export const MyRoomSummarySchema = z.strictObject({
  roomId: z.uuid(),
  title: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  displayStatus: RoomLifecycleStatusSchema,
  actorRole: z.enum(["HOST", "PARTICIPANT"]),
  membershipStatus: RoomMembershipStatusSchema,
  packVersionId: z.uuid(),
  bookTitle: z.string().min(1),
  bookAuthor: z.string().min(1),
  bookCoverUrl: z.url().nullable(),
});

export const MyRoomsResponseSchema = z.strictObject({
  items: z.array(MyRoomSummarySchema),
});

export const PrepPromptTypeSchema = z.enum([
  "QUOTE_THOUGHT",
  "IMPRESSIVE_PART",
  "DISCUSSION_QUESTION",
]);
export const PrepVisibilitySchema = z.enum(["PUBLIC", "AI_PRIVATE"]);
export const PrepBodySchema = z.string().trim().min(1).max(4000);

export const UpsertPrepEntryRequestSchema = z.strictObject({
  commandId: z.uuid(),
  payload: z.strictObject({
    entryId: z.uuid(),
    expectedRevision: z.int().positive().optional(),
    promptType: PrepPromptTypeSchema,
    visibility: PrepVisibilitySchema,
    body: PrepBodySchema,
  }),
});

export const DeletePrepEntryRequestSchema = z.strictObject({
  commandId: z.uuid(),
  payload: z.strictObject({
    entryId: z.uuid(),
    expectedRevision: z.int().positive(),
  }),
});

export const PrepEntryCommandResponseSchema = z.strictObject({
  entryId: z.uuid(),
  revision: z.int().positive(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const PrepEntrySchema = z.strictObject({
  entryId: z.uuid(),
  promptType: PrepPromptTypeSchema,
  visibility: PrepVisibilitySchema,
  body: PrepBodySchema,
  authorUserId: z.uuid(),
  authorProfileName: z.string().min(1),
  mine: z.boolean(),
  revision: z.int().positive(),
  updatedAt: z.iso.datetime(),
});

export const PrepEntriesResponseSchema = z.strictObject({
  items: z.array(PrepEntrySchema),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
export type RoomCommandResponse = z.infer<typeof RoomCommandResponseSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;
export type UpdateRoomRequest = z.infer<typeof UpdateRoomRequestSchema>;
export type CancelMembershipRequest = z.infer<typeof CancelMembershipRequestSchema>;
export type CancelRoomRequest = z.infer<typeof CancelRoomRequestSchema>;
export type TransferHostRequest = z.infer<typeof TransferHostRequestSchema>;
export type RemoveRoomMemberRequest = z.infer<typeof RemoveRoomMemberRequestSchema>;
export type RoomSearchQuery = z.infer<typeof RoomSearchQuerySchema>;
export type RoomSummary = z.infer<typeof RoomSummarySchema>;
export type RoomSearchResponse = z.infer<typeof RoomSearchResponseSchema>;
export type RoomMember = z.infer<typeof RoomMemberSchema>;
export type RoomDetail = z.infer<typeof RoomDetailSchema>;
export type MyRoomSummary = z.infer<typeof MyRoomSummarySchema>;
export type MyRoomsResponse = z.infer<typeof MyRoomsResponseSchema>;
export type PrepPromptType = z.infer<typeof PrepPromptTypeSchema>;
export type PrepVisibility = z.infer<typeof PrepVisibilitySchema>;
export type UpsertPrepEntryRequest = z.infer<typeof UpsertPrepEntryRequestSchema>;
export type DeletePrepEntryRequest = z.infer<typeof DeletePrepEntryRequestSchema>;
export type PrepEntryCommandResponse = z.infer<typeof PrepEntryCommandResponseSchema>;
export type PrepEntry = z.infer<typeof PrepEntrySchema>;
export type PrepEntriesResponse = z.infer<typeof PrepEntriesResponseSchema>;
