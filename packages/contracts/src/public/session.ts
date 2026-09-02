import { z } from "zod";

import {
  RoomActorRoleSchema,
  RoomMembershipStatusSchema,
} from "./room.js";
import {
  SessionClosingStateSchema,
  SessionResultStateSchema,
} from "./result.js";

export const SessionPhaseSchema = z.enum([
  "SCHEDULED",
  "OPENING",
  "CORE",
  "EXTENDED",
  "SYNTHESIS",
  "CLOSING",
  "ENDED",
  "CANCELED",
]);

export const SessionDeadlineSchema = z.strictObject({
  discussionEndsAt: z.iso.datetime().nullable(),
  extensionPromptedAt: z.iso.datetime().nullable(),
  extensionDecisionDeadlineAt: z.iso.datetime().nullable(),
  closingStartedAt: z.iso.datetime().nullable(),
  closingEndsAt: z.iso.datetime().nullable(),
});

export const SessionStateSchema = z.strictObject({
  phase: SessionPhaseSchema,
  phaseVersion: z.int().nonnegative(),
  aggregateVersion: z.int().nonnegative(),
  channelEpoch: z.int().positive(),
  startedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  extensionCount: z.int().nonnegative(),
  deadlines: SessionDeadlineSchema,
});

export const SessionConnectionStatusSchema = z.enum(["ONLINE", "OFFLINE"]);

export const SessionParticipantSchema = z.strictObject({
  userId: z.uuid(),
  profileName: z.string().min(1),
  role: z.enum(["HOST", "PARTICIPANT"]),
  membershipStatus: z.enum(["REGISTERED", "PARTICIPATED"]),
  connectionStatus: SessionConnectionStatusSchema,
  actualParticipation: z.boolean(),
});

export const SessionActorSchema = z.strictObject({
  userId: z.uuid(),
  role: RoomActorRoleSchema,
  membershipStatus: RoomMembershipStatusSchema.nullable(),
  actualParticipation: z.boolean(),
});

export const SessionRoomSchema = z.strictObject({
  roomId: z.uuid(),
  title: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  packVersionId: z.uuid(),
  bookTitle: z.string().min(1),
  bookAuthor: z.string().min(1),
  bookCoverUrl: z.url().nullable(),
});

export const SessionMessageKindSchema = z.enum(["PARTICIPANT", "AI_HOST"]);
export const AiHostMessageAttributionSchema = z.enum([
  "OPENING",
  "AUTOMATIC",
  "HOST_REQUESTED",
  "SYNTHESIS",
]);

export const SessionMessageAuthorSchema = z.strictObject({
  userId: z.uuid().nullable(),
  profileName: z.string().min(1),
});

export const SessionMessageReplySchema = z.strictObject({
  messageId: z.uuid(),
  authorProfileName: z.string().min(1),
  quote: z.string().min(1).max(2000),
});

export const SessionMessageSchema = z
  .strictObject({
    messageId: z.uuid(),
    sessionId: z.uuid(),
    seqNo: z.int().positive(),
    kind: SessionMessageKindSchema,
    aiAttribution: AiHostMessageAttributionSchema.nullable().optional(),
    author: SessionMessageAuthorSchema,
    clientMessageId: z.uuid().nullable(),
    body: z.string().min(1).max(2000),
    reply: SessionMessageReplySchema.nullable(),
    confirmedAt: z.iso.datetime(),
  })
  .superRefine((message, context) => {
    if (message.kind === "PARTICIPANT" && message.clientMessageId === null) {
      context.addIssue({
        code: "custom",
        message: "participant messages require clientMessageId",
        path: ["clientMessageId"],
      });
    }
    if (
      message.kind === "PARTICIPANT" &&
      message.aiAttribution !== undefined &&
      message.aiAttribution !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "participant messages cannot carry AI attribution",
        path: ["aiAttribution"],
      });
    }
    if (
      message.kind === "AI_HOST" &&
      (message.author.userId !== null || message.clientMessageId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "AI host messages cannot identify a user or client message",
        path: ["author"],
      });
    }
  });

export const SessionMessageBodySchema = z
  .string()
  .min(1)
  .max(2000)
  .refine((body) => body.trim().length > 0, "message body cannot be blank");

export const SendSessionMessageRequestSchema = z.strictObject({
  clientMessageId: z.uuid(),
  body: SessionMessageBodySchema,
  replyToMessageId: z.uuid().nullable().default(null),
});

export const SendSessionMessageResponseSchema = z.strictObject({
  roomId: z.uuid(),
  message: SessionMessageSchema,
  aggregateVersion: z.int().positive(),
  eventCursor: z.int().positive(),
  channelEpoch: z.int().positive(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const SessionHeartbeatRequestSchema = z.strictObject({
  deviceId: z.uuid(),
});

export const SessionHeartbeatResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  deviceId: z.uuid(),
  membershipStatus: z.enum(["REGISTERED", "PARTICIPATED"]),
  aggregateVersion: z.int().nonnegative(),
  eventCursor: z.int().nonnegative(),
  channelEpoch: z.int().positive(),
  connectedParticipantCount: z.int().nonnegative().max(15),
  heartbeatIntervalSeconds: z.int().min(5).max(300),
  onlineThresholdSeconds: z.int().min(5).max(300),
  lastSeenAt: z.iso.datetime(),
  serverTime: z.iso.datetime(),
});

export const StartSessionRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedPhaseVersion: z.int().nonnegative(),
  payload: z.strictObject({}),
});

export const StartedSessionStateSchema = SessionStateSchema.extend({
  phase: z.literal("OPENING"),
  startedAt: z.iso.datetime(),
  endedAt: z.null(),
  deadlines: SessionDeadlineSchema.extend({
    discussionEndsAt: z.iso.datetime(),
    extensionDecisionDeadlineAt: z.iso.datetime(),
    closingStartedAt: z.null(),
    closingEndsAt: z.null(),
  }),
});

export const StartSessionResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  state: StartedSessionStateSchema,
  eventCursor: z.int().positive(),
  connectedParticipantCount: z.int().min(2).max(15),
  minParticipants: z.int().min(2).max(15),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const SessionControlRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedPhaseVersion: z.int().positive(),
  payload: z.strictObject({}),
});

export const ExtendSessionRequestSchema = SessionControlRequestSchema;
export const StartSynthesisRequestSchema = SessionControlRequestSchema;
export const EndSessionRequestSchema = SessionControlRequestSchema;

const SessionControlResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  state: SessionStateSchema,
  eventCursor: z.int().positive(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const ExtendSessionResponseSchema = SessionControlResponseSchema.extend({
  state: SessionStateSchema.extend({
    phase: z.literal("EXTENDED"),
    endedAt: z.null(),
  }),
});

export const StartSynthesisResponseSchema = SessionControlResponseSchema.extend({
  state: SessionStateSchema.extend({
    phase: z.literal("SYNTHESIS"),
    endedAt: z.null(),
  }),
});

export const EndSessionResponseSchema = SessionControlResponseSchema.extend({
  state: SessionStateSchema.extend({
    phase: z.literal("ENDED"),
    endedAt: z.iso.datetime(),
  }),
});

export const SessionSyncQuerySchema = z.strictObject({
  afterEventCursor: z.coerce.number().int().nonnegative().default(0),
  afterMessageSeq: z.coerce.number().int().nonnegative().default(0),
  messageLimit: z.coerce.number().int().min(1).max(100).default(100),
});

export const SessionSnapshotCursorSchema = z.strictObject({
  eventCursor: z.int().nonnegative(),
  latestMessageSeq: z.int().nonnegative(),
  oldestMessageSeq: z.int().positive().nullable(),
  hasMoreMessagesBefore: z.boolean(),
  hasMoreMessagesAfter: z.boolean(),
  hasMoreEventsAfter: z.boolean(),
});

export const SessionMessagePageQuerySchema = z.strictObject({
  beforeSeq: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const SessionMessagePageCursorSchema = z
  .strictObject({
    oldestMessageSeq: z.int().positive().nullable(),
    newestMessageSeq: z.int().positive().nullable(),
    hasMoreBefore: z.boolean(),
  })
  .superRefine((cursor, context) => {
    if ((cursor.oldestMessageSeq === null) !== (cursor.newestMessageSeq === null)) {
      context.addIssue({
        code: "custom",
        message: "message page cursors must both be null or both be present",
      });
    }
  });

export const SessionMessagePageSchema = z.strictObject({
  sessionId: z.uuid(),
  serverTime: z.iso.datetime(),
  messages: z.array(SessionMessageSchema).max(50),
  page: SessionMessagePageCursorSchema,
});

export const SessionAiHelpReasonSchema = z.enum([
  "CONVERSATION_STOPPED",
  "DISCUSSION_STUCK_OR_REPETITIVE",
  "TOO_FAR_OFF_TOPIC",
  "CONFLICT_NEEDS_REFRAMING",
]);

export const SessionAiRequestStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
]);

export const RequestSessionAiHelpRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedPhaseVersion: z.int().positive(),
  reason: SessionAiHelpReasonSchema,
});

export const RequestSessionAiHelpResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  requestId: z.uuid(),
  jobId: z.uuid(),
  status: SessionAiRequestStatusSchema,
  retryAvailableAt: z.iso.datetime(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const SessionExtensionOpinionSchema = z.strictObject({
  phaseVersion: z.int().positive(),
  status: z.enum(["PENDING", "READY", "UNAVAILABLE"]),
  recommendation: z.enum(["EXTEND", "FINISH"]).nullable(),
  reason: z.string().min(1).max(500).nullable(),
  basedThroughSeq: z.int().nonnegative().nullable(),
});

export const SessionHostHelpRequestStateSchema = z.strictObject({
  requestId: z.uuid(),
  reason: SessionAiHelpReasonSchema,
  status: SessionAiRequestStatusSchema,
  requestedAt: z.iso.datetime(),
  retryAvailableAt: z.iso.datetime(),
});

export const SessionAiStateSchema = z.strictObject({
  extensionOpinion: SessionExtensionOpinionSchema.nullable(),
  latestHostHelpRequest: SessionHostHelpRequestStateSchema.nullable(),
});

const SessionEventEnvelopeSchema = z.strictObject({
  eventId: z.uuid(),
  sessionId: z.uuid(),
  eventCursor: z.int().positive(),
  aggregateVersion: z.int().positive(),
  channelEpoch: z.int().positive(),
  occurredAt: z.iso.datetime(),
});

export const MessageAppendedEventSchema = SessionEventEnvelopeSchema.extend({
  type: z.literal("MESSAGE_APPENDED"),
  payload: z.strictObject({ message: SessionMessageSchema }),
});

export const SessionStateTransitionReasonSchema = z.enum([
  "STARTED",
  "OPENING_COMPLETED_BY_AI",
  "EXTENSION_WINDOW_OPENED",
  "EXTENDED_BY_HOST",
  "SYNTHESIS_REQUESTED_BY_HOST",
  "SYNTHESIS_STARTED_BY_TIMEOUT",
  "CLOSING_STARTED",
  "ENDED_BY_HOST",
  "CLOSING_EXPIRED",
  "CLOSING_COMPLETED_EARLY",
]);

export const SessionStateChangedEventSchema = SessionEventEnvelopeSchema.extend({
  type: z.literal("SESSION_STATE_CHANGED"),
  payload: z.strictObject({
    state: SessionStateSchema,
    reason: SessionStateTransitionReasonSchema.optional(),
  }),
});

export const SessionParticipantChangedEventSchema = SessionEventEnvelopeSchema.extend({
  type: z.literal("SESSION_PARTICIPANT_CHANGED"),
  payload: z.strictObject({
    participantUserId: z.uuid(),
    participant: SessionParticipantSchema.nullable(),
    participantCount: z.int().nonnegative().max(15),
    connectedParticipantCount: z.int().nonnegative().max(15),
  }),
});

export const SessionAiStateChangedEventSchema = SessionEventEnvelopeSchema.extend({
  type: z.literal("SESSION_AI_STATE_CHANGED"),
  payload: z.strictObject({
    extensionOpinion: SessionExtensionOpinionSchema,
  }),
});

export const SessionClosingProgressChangedEventSchema =
  SessionEventEnvelopeSchema.extend({
    type: z.literal("SESSION_CLOSING_PROGRESS_CHANGED"),
    payload: z.strictObject({
      eligibleParticipantCount: z.int().nonnegative().max(15),
      completedParticipantCount: z.int().nonnegative().max(15),
    }),
  });

export const SessionResultStateChangedEventSchema =
  SessionEventEnvelopeSchema.extend({
    type: z.literal("SESSION_RESULT_STATE_CHANGED"),
    payload: z.strictObject({
      result: SessionResultStateSchema,
    }),
  });

export const SessionEventSchema = z.discriminatedUnion("type", [
  MessageAppendedEventSchema,
  SessionStateChangedEventSchema,
  SessionParticipantChangedEventSchema,
  SessionAiStateChangedEventSchema,
  SessionClosingProgressChangedEventSchema,
  SessionResultStateChangedEventSchema,
]);

export const SessionRealtimeChannelsSchema = z.strictObject({
  eventTopic: z.string().min(1),
  ephemeralTopic: z.string().min(1),
});

export const SessionRealtimeBroadcastPayloadSchema = z
  .strictObject({
    id: z.uuid(),
    event: SessionEventSchema,
  })
  .superRefine((payload, context) => {
    if (payload.id !== payload.event.eventId) {
      context.addIssue({
        code: "custom",
        message: "broadcast transport id must match the committed event id",
        path: ["id"],
      });
    }
  });

export const SessionTypingBroadcastSchema = z.strictObject({
  userId: z.uuid(),
  typing: z.boolean(),
  sentAt: z.iso.datetime(),
});

export const SessionSnapshotSchema = z
  .strictObject({
    sessionId: z.uuid(),
    serverTime: z.iso.datetime(),
    room: SessionRoomSchema,
    actor: SessionActorSchema,
    state: SessionStateSchema,
    participants: z.array(SessionParticipantSchema).max(15),
    connectedParticipantCount: z.int().nonnegative().max(15),
    messages: z.array(SessionMessageSchema).max(100),
    events: z.array(SessionEventSchema).max(200),
    cursors: SessionSnapshotCursorSchema,
    publicDiscussion: z.strictObject({
      currentTopic: z.string().min(1).nullable(),
    }),
    ai: SessionAiStateSchema,
    closing: SessionClosingStateSchema.nullable(),
    result: SessionResultStateSchema,
    realtime: SessionRealtimeChannelsSchema.nullable(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.realtime === null) {
      if (
        snapshot.state.phase !== "ENDED" &&
        snapshot.state.phase !== "CANCELED"
      ) {
        context.addIssue({
          code: "custom",
          message: "an active session requires realtime topics",
          path: ["realtime"],
        });
      }
      return;
    }

    const baseTopic = `session:${snapshot.sessionId}:v${snapshot.state.channelEpoch}`;
    if (snapshot.realtime.eventTopic !== baseTopic) {
      context.addIssue({
        code: "custom",
        message: "event topic must match the authoritative channel epoch",
        path: ["realtime", "eventTopic"],
      });
    }
    if (snapshot.realtime.ephemeralTopic !== `${baseTopic}:ephemeral`) {
      context.addIssue({
        code: "custom",
        message: "ephemeral topic must match the authoritative channel epoch",
        path: ["realtime", "ephemeralTopic"],
      });
    }
  });

export type SessionPhase = z.infer<typeof SessionPhaseSchema>;
export type SessionDeadline = z.infer<typeof SessionDeadlineSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type SessionConnectionStatus = z.infer<typeof SessionConnectionStatusSchema>;
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;
export type SessionActor = z.infer<typeof SessionActorSchema>;
export type SessionRoom = z.infer<typeof SessionRoomSchema>;
export type SessionMessageKind = z.infer<typeof SessionMessageKindSchema>;
export type SessionMessage = z.infer<typeof SessionMessageSchema>;
export type SendSessionMessageRequest = z.infer<typeof SendSessionMessageRequestSchema>;
export type SendSessionMessageResponse = z.infer<typeof SendSessionMessageResponseSchema>;
export type SessionMessagePageQuery = z.infer<typeof SessionMessagePageQuerySchema>;
export type SessionMessagePage = z.infer<typeof SessionMessagePageSchema>;
export type SessionAiHelpReason = z.infer<typeof SessionAiHelpReasonSchema>;
export type SessionAiRequestStatus = z.infer<typeof SessionAiRequestStatusSchema>;
export type RequestSessionAiHelpRequest = z.infer<
  typeof RequestSessionAiHelpRequestSchema
>;
export type RequestSessionAiHelpResponse = z.infer<
  typeof RequestSessionAiHelpResponseSchema
>;
export type SessionExtensionOpinion = z.infer<
  typeof SessionExtensionOpinionSchema
>;
export type SessionHostHelpRequestState = z.infer<
  typeof SessionHostHelpRequestStateSchema
>;
export type SessionAiState = z.infer<typeof SessionAiStateSchema>;
export type SessionHeartbeatRequest = z.infer<typeof SessionHeartbeatRequestSchema>;
export type SessionHeartbeatResponse = z.infer<typeof SessionHeartbeatResponseSchema>;
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;
export type SessionControlRequest = z.infer<typeof SessionControlRequestSchema>;
export type ExtendSessionRequest = z.infer<typeof ExtendSessionRequestSchema>;
export type ExtendSessionResponse = z.infer<typeof ExtendSessionResponseSchema>;
export type StartSynthesisRequest = z.infer<typeof StartSynthesisRequestSchema>;
export type StartSynthesisResponse = z.infer<typeof StartSynthesisResponseSchema>;
export type EndSessionRequest = z.infer<typeof EndSessionRequestSchema>;
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
export type SessionStateTransitionReason = z.infer<
  typeof SessionStateTransitionReasonSchema
>;
export type SessionSyncQuery = z.infer<typeof SessionSyncQuerySchema>;
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type SessionRealtimeChannels = z.infer<typeof SessionRealtimeChannelsSchema>;
export type SessionRealtimeBroadcastPayload = z.infer<
  typeof SessionRealtimeBroadcastPayloadSchema
>;
export type SessionTypingBroadcast = z.infer<typeof SessionTypingBroadcastSchema>;
