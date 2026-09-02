import { HttpStatus } from "@nestjs/common";

import { PublicHttpException } from "../../http/public-http.exception.js";
import { RoomGatewayError } from "./room.gateway.js";

const roomErrors = {
  command_payload_mismatch: [
    HttpStatus.CONFLICT,
    "COMMAND_PAYLOAD_MISMATCH",
    "같은 요청 식별자가 다른 내용에 사용되었습니다.",
  ],
  room_capacity_reached: [
    HttpStatus.CONFLICT,
    "ROOM_CAPACITY_REACHED",
    "방금 정원이 마감되었습니다.",
  ],
  room_member_removed: [
    HttpStatus.FORBIDDEN,
    "ROOM_MEMBER_REMOVED",
    "이 토론방에 다시 참여할 수 없습니다.",
  ],
  room_password_rate_limited: [
    HttpStatus.TOO_MANY_REQUESTS,
    "ROOM_PASSWORD_RATE_LIMITED",
    "잠시 후 다시 시도해주세요.",
  ],
  room_password_changed: [
    HttpStatus.CONFLICT,
    "ROOM_PASSWORD_CHANGED",
    "참가 패스워드가 변경되었습니다. 다시 입력해주세요.",
  ],
  room_password_required: [
    HttpStatus.FORBIDDEN,
    "ROOM_PASSWORD_REQUIRED",
    "참가 패스워드를 입력해주세요.",
  ],
  invalid_join_authorization: [
    HttpStatus.CONFLICT,
    "JOIN_AUTHORIZATION_EXPIRED",
    "참가 확인 시간이 만료되었습니다. 패스워드를 다시 입력해주세요.",
  ],
  room_canceled: [HttpStatus.CONFLICT, "ROOM_CANCELED", "취소된 토론방입니다."],
  room_ended: [HttpStatus.CONFLICT, "ROOM_ENDED", "이미 종료된 토론방입니다."],
  room_not_found: [
    HttpStatus.NOT_FOUND,
    "ROOM_NOT_FOUND",
    "토론방을 찾을 수 없습니다.",
  ],
  aggregate_version_conflict: [
    HttpStatus.CONFLICT,
    "AGGREGATE_VERSION_CONFLICT",
    "토론방 정보가 변경되었습니다. 최신 상태를 확인해주세요.",
  ],
  room_settings_locked: [
    HttpStatus.CONFLICT,
    "ROOM_SETTINGS_LOCKED",
    "현재 상태에서는 토론방 설정을 변경할 수 없습니다.",
  ],
  room_command_locked: [
    HttpStatus.CONFLICT,
    "ROOM_COMMAND_LOCKED",
    "현재 상태에서는 이 작업을 수행할 수 없습니다.",
  ],
  room_book_locked_by_membership: [
    HttpStatus.CONFLICT,
    "ROOM_BOOK_LOCKED",
    "다른 참가자가 등록한 뒤에는 책을 변경할 수 없습니다.",
  ],
  room_host_required: [
    HttpStatus.FORBIDDEN,
    "ROOM_HOST_REQUIRED",
    "방장만 이 작업을 수행할 수 있습니다.",
  ],
  host_cannot_cancel_membership: [
    HttpStatus.CONFLICT,
    "HOST_CANNOT_CANCEL_MEMBERSHIP",
    "방장은 권한을 이전하거나 토론방을 취소해야 합니다.",
  ],
  registered_membership_not_found: [
    HttpStatus.NOT_FOUND,
    "REGISTERED_MEMBERSHIP_NOT_FOUND",
    "참가 등록 정보를 찾을 수 없습니다.",
  ],
  host_transfer_target_not_registered: [
    HttpStatus.CONFLICT,
    "HOST_TRANSFER_TARGET_NOT_REGISTERED",
    "참가 등록된 회원에게만 방장 권한을 이전할 수 있습니다.",
  ],
  prep_write_not_allowed: [
    HttpStatus.FORBIDDEN,
    "PREP_WRITE_NOT_ALLOWED",
    "현재 상태에서는 사전 입력을 변경할 수 없습니다.",
  ],
  prep_read_not_allowed: [
    HttpStatus.FORBIDDEN,
    "PREP_READ_NOT_ALLOWED",
    "사전 입력을 볼 수 없습니다.",
  ],
  prep_author_required: [
    HttpStatus.FORBIDDEN,
    "PREP_AUTHOR_REQUIRED",
    "자신의 사전 입력만 변경할 수 있습니다.",
  ],
  prep_revision_conflict: [
    HttpStatus.CONFLICT,
    "PREP_REVISION_CONFLICT",
    "사전 입력이 변경되었습니다. 최신 내용을 확인해주세요.",
  ],
  prep_entry_not_found: [
    HttpStatus.NOT_FOUND,
    "PREP_ENTRY_NOT_FOUND",
    "사전 입력을 찾을 수 없습니다.",
  ],
  invalid_room_capacity: [
    HttpStatus.BAD_REQUEST,
    "INVALID_ROOM_CAPACITY",
    "참가 인원 설정을 확인해주세요.",
  ],
  published_pack_required: [
    HttpStatus.BAD_REQUEST,
    "PUBLISHED_PACK_REQUIRED",
    "토론에 사용할 수 있는 책을 선택해주세요.",
  ],
  invalid_host_transfer_target: [
    HttpStatus.BAD_REQUEST,
    "INVALID_HOST_TRANSFER_TARGET",
    "새 방장을 다시 선택해주세요.",
  ],
  invalid_remove_target: [
    HttpStatus.BAD_REQUEST,
    "INVALID_REMOVE_TARGET",
    "내보낼 참가자를 다시 선택해주세요.",
  ],
  invalid_prep_entry: [
    HttpStatus.BAD_REQUEST,
    "INVALID_PREP_ENTRY",
    "사전 입력 내용을 확인해주세요.",
  ],
  room_membership_required: [
    HttpStatus.FORBIDDEN,
    "ROOM_MEMBERSHIP_REQUIRED",
    "참가 등록된 회원만 참가자 목록을 볼 수 있습니다.",
  ],
} as const satisfies Record<string, readonly [HttpStatus, string, string]>;

export function rethrowRoomError(error: unknown): never {
  if (error instanceof PublicHttpException) throw error;
  if (!(error instanceof RoomGatewayError)) throw error;
  const detail = roomErrors[error.code as keyof typeof roomErrors];
  if (detail === undefined) throw error;
  throw new PublicHttpException(detail[0], detail[1], detail[2]);
}
