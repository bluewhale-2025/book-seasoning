import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { useMyRoomsQuery } from "./room-query";
import { roomCategory, type MyRoomCategory } from "./room-presenters";
import { RoomSummaryCard, type RoomSummaryView } from "./room-summary-card";

const categories: ReadonlyArray<Readonly<{ value: MyRoomCategory; label: string }>> = [
  { value: "active", label: "진행 중" },
  { value: "scheduled", label: "예정" },
  { value: "ended", label: "종료" },
];

function emptyCopy(category: MyRoomCategory) {
  if (category === "active") return "지금 진행 중인 토론이 없습니다.";
  if (category === "scheduled") return "예정된 토론이 없습니다.";
  return "아직 종료된 토론이 없습니다.";
}

export function MyDiscussionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("view");
  const selected: MyRoomCategory = categories.some((item) => item.value === requested)
    ? requested as MyRoomCategory
    : "active";
  const rooms = useMyRoomsQuery();
  const grouped = Object.fromEntries(
    categories.map(({ value }) => [
      value,
      (rooms.data?.items ?? [])
        .filter((room) => roomCategory(room.displayStatus) === value)
        .sort((left, right) => {
          const difference = Date.parse(left.scheduledStartAt) - Date.parse(right.scheduledStartAt);
          return value === "scheduled" ? difference : -difference;
        }),
    ]),
  ) as Record<MyRoomCategory, NonNullable<typeof rooms.data>["items"]>;
  const current = grouped[selected];
  const total = rooms.data?.items.length ?? 0;

  return (
    <main className="px-5 pb-20 sm:px-8">
      <section className="mx-auto max-w-[var(--layout-shell-max)] pt-12 sm:pt-16">
        <header className="mb-9 sm:mb-12">
          <h1 className="text-display m-0">내 토론</h1>
        </header>

        <div className="mb-8 flex gap-7 border-b border-border" role="tablist" aria-label="내 토론 분류">
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              role="tab"
              aria-selected={selected === category.value}
              onClick={() => setSearchParams(category.value === "active" ? {} : { view: category.value })}
              className={cn(
                "relative flex min-h-12 items-center gap-2 border-0 bg-transparent px-0 text-[15px] font-medium text-muted-foreground",
                selected === category.value && "text-foreground after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-foreground",
              )}
            >
              {category.label}<span className="text-metadata">{grouped[category.value].length}</span>
            </button>
          ))}
        </div>

        {rooms.isPending && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="내 토론 불러오는 중">
            {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-surface-muted" />)}
          </div>
        )}

        {rooms.isError && (
          <section className="grid justify-items-start gap-4 py-14">
            <h2 className="text-section-title m-0">내 토론을 불러오지 못했습니다</h2>
            <Button onClick={() => void rooms.refetch()}>다시 시도</Button>
          </section>
        )}

        {rooms.isSuccess && total === 0 && (
          <section className="grid justify-items-center gap-4 rounded-xl bg-surface py-16 text-center">
            <h2 className="text-section-title m-0">아직 참여한 토론이 없습니다</h2>
            <p className="text-body m-0 text-muted-foreground">열려 있는 토론을 찾거나 직접 만들어보세요.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild><Link to="/discussions/find">토론 찾기</Link></Button>
              <Button asChild variant="primary"><Link to="/rooms/new">토론 만들기</Link></Button>
            </div>
          </section>
        )}

        {rooms.isSuccess && total > 0 && current.length === 0 && (
          <section className="grid justify-items-start gap-4 py-14">
            <p className="text-body m-0 text-muted-foreground">{emptyCopy(selected)}</p>
            {selected === "scheduled" && <Button asChild><Link to="/discussions/find">토론 찾기</Link></Button>}
          </section>
        )}

        {rooms.isSuccess && current.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" role="tabpanel">
            {current.map((room) => {
              const view: RoomSummaryView = {
                ...room,
                displayStatus: room.displayStatus,
                role: room.actorRole,
              };
              return (
                <RoomSummaryCard
                  key={room.roomId}
                  room={view}
                  disabled={room.displayStatus === "CANCELED"}
                  to={selected === "active" ? `/rooms/${room.roomId}/session` : `/rooms/${room.roomId}`}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
