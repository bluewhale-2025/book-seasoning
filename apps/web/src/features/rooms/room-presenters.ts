import type { RoomDetail } from "@bookseasoning/contracts/public";

export type RoomLifecycleStatus = RoomDetail["displayStatus"];

export const roomStatusLabel: Record<RoomLifecycleStatus, string> = {
  SCHEDULED: "시작 예정",
  WAITING: "시작 대기",
  DISCUSSING: "토론 중",
  EXTENDED: "연장 중",
  CLOSING: "마무리 중",
  ENDED: "종료",
  CANCELED: "취소됨",
};

export type MyRoomCategory = "active" | "scheduled" | "ended";

export function roomCategory(status: RoomLifecycleStatus): MyRoomCategory {
  if (status === "SCHEDULED" || status === "WAITING") return "scheduled";
  if (status === "ENDED" || status === "CANCELED") return "ended";
  return "active";
}

const roomDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatRoomDate(value: string): string {
  return roomDateFormatter.format(new Date(value));
}
