import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CancelMembershipRequest,
  CancelRoomRequest,
  CreateRoomRequest,
  DeletePrepEntryRequest,
  JoinRoomRequest,
  RemoveRoomMemberRequest,
  RoomSearchQuery,
  StartSessionRequest,
  TransferHostRequest,
  UpdateRoomRequest,
  UpsertPrepEntryRequest,
} from "@bookseasoning/contracts/public";

import { useAppRuntime } from "../../app/app-runtime";

export const roomQueryKeys = {
  all: ["rooms"] as const,
  search: (query: RoomSearchQuery) => ["rooms", "search", query] as const,
  mine: ["rooms", "mine"] as const,
  detail: (roomId: string) => ["rooms", "detail", roomId] as const,
  prep: (roomId: string) => ["rooms", roomId, "prep"] as const,
  waitingSession: (roomId: string) => ["rooms", roomId, "waiting-session"] as const,
};

export function useRoomSearchQuery(query: RoomSearchQuery) {
  const { rooms } = useAppRuntime();
  return useQuery({
    queryKey: roomQueryKeys.search(query),
    queryFn: () => rooms.searchRooms(query),
  });
}

export function useMyRoomsQuery() {
  const { rooms } = useAppRuntime();
  return useQuery({ queryKey: roomQueryKeys.mine, queryFn: () => rooms.getMyRooms() });
}

export function useRoomDetailQuery(roomId: string) {
  const { rooms } = useAppRuntime();
  return useQuery({
    queryKey: roomQueryKeys.detail(roomId),
    queryFn: () => rooms.getRoom(roomId),
  });
}

export function useCreateRoomMutation() {
  const { rooms } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateRoomRequest) => rooms.createRoom(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomQueryKeys.all });
    },
  });
}

export function useJoinRoomMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: JoinRoomRequest) => rooms.joinRoom(roomId, request),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: roomQueryKeys.detail(roomId) }),
        queryClient.invalidateQueries({ queryKey: roomQueryKeys.mine }),
        queryClient.invalidateQueries({ queryKey: ["rooms", "search"] }),
      ]);
    },
  });
}

export function usePrepEntriesQuery(roomId: string, enabled: boolean) {
  const { rooms } = useAppRuntime();
  return useQuery({
    queryKey: roomQueryKeys.prep(roomId),
    queryFn: () => rooms.getPrepEntries(roomId),
    enabled,
  });
}

export function useWaitingRoomSessionQuery(roomId: string, enabled: boolean) {
  const { sessions } = useAppRuntime();
  return useQuery({
    queryKey: roomQueryKeys.waitingSession(roomId),
    queryFn: () => sessions.sync(roomId, {
      afterEventCursor: 0,
      afterMessageSeq: 0,
      messageLimit: 1,
    }),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
  });
}

function useRoomCommandInvalidation(roomId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: roomQueryKeys.detail(roomId) }),
      queryClient.invalidateQueries({ queryKey: roomQueryKeys.mine }),
      queryClient.invalidateQueries({ queryKey: ["rooms", "search"] }),
      queryClient.invalidateQueries({ queryKey: roomQueryKeys.waitingSession(roomId) }),
    ]);
  };
}

export function useUpdateRoomMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: UpdateRoomRequest) => rooms.updateRoom(roomId, request),
    onSuccess: invalidate,
  });
}

export function useCancelMembershipMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: CancelMembershipRequest) =>
      rooms.cancelMembership(roomId, request),
    onSuccess: invalidate,
  });
}

export function useCancelRoomMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: CancelRoomRequest) => rooms.cancelRoom(roomId, request),
    onSuccess: invalidate,
  });
}

export function useTransferHostMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: TransferHostRequest) => rooms.transferHost(roomId, request),
    onSuccess: invalidate,
  });
}

export function useRemoveMemberMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: RemoveRoomMemberRequest) => rooms.removeMember(roomId, request),
    onSuccess: invalidate,
  });
}

export function useUpsertPrepEntryMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertPrepEntryRequest) => rooms.upsertPrepEntry(roomId, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomQueryKeys.prep(roomId) });
    },
  });
}

export function useDeletePrepEntryMutation(roomId: string) {
  const { rooms } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeletePrepEntryRequest) => rooms.deletePrepEntry(roomId, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomQueryKeys.prep(roomId) });
    },
  });
}

export function useStartSessionMutation(roomId: string) {
  const { sessions } = useAppRuntime();
  const invalidate = useRoomCommandInvalidation(roomId);
  return useMutation({
    mutationFn: (request: StartSessionRequest) => sessions.startSession(roomId, request),
    onSuccess: invalidate,
  });
}
