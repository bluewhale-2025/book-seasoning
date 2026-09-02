import { z } from "zod";

import {
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  MyRoomSummarySchema,
  PrepEntryCommandResponseSchema,
  PrepEntrySchema,
  RoomCommandResponseSchema,
  RoomDetailSchema,
  RoomMemberSchema,
  RoomSummarySchema,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type MyRoomSummary,
  type PrepEntry,
  type PrepEntryCommandResponse,
  type RoomCommandResponse,
  type RoomDetail,
  type RoomMember,
  type RoomSummary,
} from "@bookseasoning/contracts/public";

import type { RoomJoinChallenge } from "./room.gateway.js";

const CreateRoomRowSchema = z.strictObject({
  room_id: z.uuid(),
  aggregate_version: z.int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const RoomSummaryRowSchema = z.strictObject({
  room_id: z.uuid(),
  title: z.string().min(1),
  scheduled_start_at: z.iso.datetime({ offset: true }),
  display_status: z.enum(["SCHEDULED", "WAITING", "DISCUSSING", "EXTENDED", "CLOSING"]),
  availability: z.enum(["OPEN", "FULL"]),
  participant_count: z.number().int().nonnegative(),
  max_participants: z.number().int(),
  host_profile_name: z.string().min(1),
  pack_version_id: z.uuid(),
  book_title: z.string().min(1),
  book_author: z.string().min(1),
  book_cover_url: z.string().nullable(),
});

const JoinChallengeRowSchema = z.discriminatedUnion("challenge_state", [
  z.strictObject({
    room_id: z.uuid(),
    challenge_state: z.literal("ALREADY_MEMBER"),
    password_hash: z.null(),
    password_version: z.int().positive(),
  }),
  z.strictObject({
    room_id: z.uuid(),
    challenge_state: z.literal("PASSWORD_REQUIRED"),
    password_hash: z.string().startsWith("$argon2id$"),
    password_version: z.int().positive(),
  }),
]);

const JoinRoomRowSchema = z.strictObject({
  room_id: z.uuid(),
  aggregate_version: z.int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
  membership_status: z.enum(["REGISTERED", "PARTICIPATED"]),
  participant_count: z.number().int().positive(),
});

const RoomCommandRowSchema = z.strictObject({
  room_id: z.uuid(),
  aggregate_version: z.int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const RoomMemberRowSchema = z.strictObject({
  user_id: z.uuid(),
  profile_name: z.string().min(1),
  membership_status: z.enum(["REGISTERED", "PARTICIPATED"]),
  is_host: z.boolean(),
});

const RoomDetailRowSchema = z.strictObject({
  room_id: z.uuid(),
  aggregate_version: z.int().positive(),
  title: z.string().min(1),
  scheduled_start_at: z.iso.datetime({ offset: true }),
  display_status: z.enum([
    "SCHEDULED",
    "WAITING",
    "DISCUSSING",
    "EXTENDED",
    "CLOSING",
    "ENDED",
    "CANCELED",
  ]),
  availability: z.enum(["OPEN", "FULL"]),
  participant_count: z.number().int().nonnegative(),
  min_participants: z.number().int().min(2).max(15),
  max_participants: z.number().int().min(2).max(15),
  actor_role: z.enum(["HOST", "PARTICIPANT", "NONE"]),
  membership_status: z
    .enum([
      "REGISTERED",
      "PARTICIPATED",
      "CANCELED",
      "CANCELED_BY_ROOM",
      "REMOVED",
      "NO_SHOW",
    ])
    .nullable(),
  pack_version_id: z.uuid(),
  book_title: z.string().min(1),
  book_author: z.string().min(1),
  book_cover_url: z.string().nullable(),
});

const MyRoomSummaryRowSchema = z.strictObject({
  room_id: z.uuid(),
  title: z.string().min(1),
  scheduled_start_at: z.iso.datetime({ offset: true }),
  display_status: RoomDetailRowSchema.shape.display_status,
  actor_role: z.enum(["HOST", "PARTICIPANT"]),
  membership_status: RoomDetailRowSchema.shape.membership_status.unwrap(),
  pack_version_id: z.uuid(),
  book_title: z.string().min(1),
  book_author: z.string().min(1),
  book_cover_url: z.string().nullable(),
});

const PrepEntryRowSchema = z.strictObject({
  entry_id: z.uuid(),
  prompt_type: z.enum(["QUOTE_THOUGHT", "IMPRESSIVE_PART", "DISCUSSION_QUESTION"]),
  visibility: z.enum(["PUBLIC", "AI_PRIVATE"]),
  body: z.string().min(1).max(4000),
  author_user_id: z.uuid(),
  author_profile_name: z.string().min(1),
  mine: z.boolean(),
  revision: z.number().int().positive(),
  updated_at: z.iso.datetime({ offset: true }),
});

const PrepCommandRowSchema = z.strictObject({
  entry_id: z.uuid(),
  revision: z.int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

export type RoomDetailRow = z.infer<typeof RoomDetailRowSchema>;

export function mapCreateRoomRow(value: unknown): CreateRoomResponse {
  const row = CreateRoomRowSchema.parse(value);
  return CreateRoomResponseSchema.parse({
    roomId: row.room_id,
    aggregateVersion: row.aggregate_version,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}

export function mapRoomSummaryRow(value: unknown): RoomSummary {
  const row = RoomSummaryRowSchema.parse(value);
  return RoomSummarySchema.parse({
    roomId: row.room_id,
    title: row.title,
    scheduledStartAt: new Date(row.scheduled_start_at).toISOString(),
    displayStatus: row.display_status,
    availability: row.availability,
    participantCount: row.participant_count,
    maxParticipants: row.max_participants,
    hostProfileName: row.host_profile_name,
    packVersionId: row.pack_version_id,
    bookTitle: row.book_title,
    bookAuthor: row.book_author,
    bookCoverUrl: row.book_cover_url,
  });
}

export function mapRoomSummaryRows(value: unknown): readonly RoomSummary[] {
  return z.array(RoomSummaryRowSchema).parse(value).map(mapRoomSummaryRow);
}

export function mapRoomJoinChallenge(value: unknown): RoomJoinChallenge {
  const row = JoinChallengeRowSchema.parse(value);
  return row.challenge_state === "ALREADY_MEMBER"
    ? { state: "ALREADY_MEMBER", passwordVersion: row.password_version }
    : {
        state: "PASSWORD_REQUIRED",
        passwordHash: row.password_hash,
        passwordVersion: row.password_version,
      };
}

export function mapJoinRoomRow(value: unknown): JoinRoomResponse {
  const row = JoinRoomRowSchema.parse(value);
  return JoinRoomResponseSchema.parse({
    roomId: row.room_id,
    aggregateVersion: row.aggregate_version,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
    membershipStatus: row.membership_status,
    participantCount: row.participant_count,
  });
}

export function mapRoomCommandRow(value: unknown): RoomCommandResponse {
  const row = RoomCommandRowSchema.parse(value);
  return RoomCommandResponseSchema.parse({
    roomId: row.room_id,
    aggregateVersion: row.aggregate_version,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}

export function parseRoomDetailRow(value: unknown): RoomDetailRow {
  return RoomDetailRowSchema.parse(value);
}

export function mapRoomMemberRows(value: unknown): readonly RoomMember[] {
  return z.array(RoomMemberRowSchema).parse(value).map((row) =>
    RoomMemberSchema.parse({
      userId: row.user_id,
      profileName: row.profile_name,
      membershipStatus: row.membership_status,
      isHost: row.is_host,
    }),
  );
}

export function mapRoomDetailRow(
  row: RoomDetailRow,
  members: readonly RoomMember[],
): RoomDetail {
  return RoomDetailSchema.parse({
    roomId: row.room_id,
    aggregateVersion: row.aggregate_version,
    title: row.title,
    scheduledStartAt: new Date(row.scheduled_start_at).toISOString(),
    displayStatus: row.display_status,
    availability: row.availability,
    participantCount: row.participant_count,
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    actorRole: row.actor_role,
    membershipStatus: row.membership_status,
    packVersionId: row.pack_version_id,
    bookTitle: row.book_title,
    bookAuthor: row.book_author,
    bookCoverUrl: row.book_cover_url,
    members,
  });
}

export function mapMyRoomSummaryRows(value: unknown): readonly MyRoomSummary[] {
  return z.array(MyRoomSummaryRowSchema).parse(value).map((row) =>
    MyRoomSummarySchema.parse({
      roomId: row.room_id,
      title: row.title,
      scheduledStartAt: new Date(row.scheduled_start_at).toISOString(),
      displayStatus: row.display_status,
      actorRole: row.actor_role,
      membershipStatus: row.membership_status,
      packVersionId: row.pack_version_id,
      bookTitle: row.book_title,
      bookAuthor: row.book_author,
      bookCoverUrl: row.book_cover_url,
    }),
  );
}

export function mapPrepEntryRows(value: unknown): readonly PrepEntry[] {
  return z.array(PrepEntryRowSchema).parse(value).map((row) =>
    PrepEntrySchema.parse({
      entryId: row.entry_id,
      promptType: row.prompt_type,
      visibility: row.visibility,
      body: row.body,
      authorUserId: row.author_user_id,
      authorProfileName: row.author_profile_name,
      mine: row.mine,
      revision: row.revision,
      updatedAt: new Date(row.updated_at).toISOString(),
    }),
  );
}

export function mapPrepCommandRow(value: unknown): PrepEntryCommandResponse {
  const row = PrepCommandRowSchema.parse(value);
  return PrepEntryCommandResponseSchema.parse({
    entryId: row.entry_id,
    revision: row.revision,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}
