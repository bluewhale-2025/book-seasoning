import { UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { BookCover } from "../../components/book/book-cover";
import { cn } from "../../lib/utils";
import {
  formatRoomDate,
  roomStatusLabel,
  type RoomLifecycleStatus,
} from "./room-presenters";

export type RoomSummaryView = Readonly<{
  roomId: string;
  title: string;
  scheduledStartAt: string;
  displayStatus: RoomLifecycleStatus;
  bookTitle: string;
  bookAuthor: string;
  bookCoverUrl: string | null;
  hostProfileName?: string;
  participantCount?: number;
  maxParticipants?: number;
  availability?: "OPEN" | "FULL";
  role?: "HOST" | "PARTICIPANT";
}>;

function SummaryCardContent({ room }: Readonly<{ room: RoomSummaryView }>) {
  return (
    <article className="grid min-h-52 grid-cols-[68px_minmax(0,1fr)] gap-5 rounded-xl border border-border bg-surface-elevated p-5 transition-colors hover:border-border-strong hover:bg-surface">
      <BookCover
        title={room.bookTitle}
        src={room.bookCoverUrl ?? undefined}
        size="lg"
        className="self-start"
      />
      <div className="flex min-w-0 flex-col">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant={room.displayStatus === "DISCUSSING" ? "accent" : "neutral"}>
            {roomStatusLabel[room.displayStatus]}
          </Badge>
          {room.availability && (
            <Badge variant={room.availability === "OPEN" ? "outline" : "neutral"}>
              {room.availability === "OPEN" ? "참여 가능" : "정원 마감"}
            </Badge>
          )}
          {room.role && <Badge variant="outline">{room.role === "HOST" ? "방장" : "참가자"}</Badge>}
        </div>
        <h3 className="m-0 line-clamp-2 text-[18px] leading-7 font-semibold tracking-[-0.01em]">
          {room.title}
        </h3>
        <p className="text-metadata mt-1 mb-0 truncate text-muted-foreground">
          {room.bookTitle} · {room.bookAuthor}
        </p>
        <div className="text-caption mt-auto grid gap-1 pt-5 text-muted-foreground">
          {room.hostProfileName && <span>방장 {room.hostProfileName}</span>}
          <span>{formatRoomDate(room.scheduledStartAt)}</span>
          {room.participantCount !== undefined && room.maxParticipants !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <UsersRound aria-hidden="true" className="size-3.5" />
              {room.participantCount} / {room.maxParticipants}명
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function RoomSummaryCard({
  room,
  disabled = false,
  className,
  to = `/rooms/${room.roomId}`,
}: Readonly<{ room: RoomSummaryView; disabled?: boolean; className?: string; to?: string }>) {
  if (disabled) {
    return (
      <div aria-disabled="true" className={cn("opacity-65", className)}>
        <SummaryCardContent room={room} />
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={cn("block rounded-xl text-foreground no-underline focus-visible:outline-offset-4", className)}
      aria-label={`${room.title}, ${roomStatusLabel[room.displayStatus]}`}
    >
      <SummaryCardContent room={room} />
    </Link>
  );
}
