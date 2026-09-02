import * as React from "react";
import { Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button, IconButton } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useRoomSearchQuery } from "./room-query";
import { RoomSummaryCard, type RoomSummaryView } from "./room-summary-card";

function SearchField({ initialQuery }: Readonly<{ initialQuery: string }>) {
  const [, setSearchParams] = useSearchParams();
  const [value, setValue] = React.useState(initialQuery);

  React.useEffect(() => setValue(initialQuery), [initialQuery]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    setSearchParams(query ? { q: query } : {}, { replace: false });
  }

  return (
    <form onSubmit={submit} role="search" className="mx-auto grid w-full max-w-2xl grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={200}
        placeholder="방 제목, 책, 저자 검색"
        aria-label="방 제목, 책, 저자 검색"
        className="h-14 rounded-lg px-4 text-[16px]"
      />
      <IconButton label="검색" variant="primary" className="size-14 rounded-lg" type="submit">
        <Search aria-hidden="true" />
      </IconButton>
    </form>
  );
}

function RoomGrid({ rooms }: Readonly<{ rooms: readonly RoomSummaryView[] }>) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => <RoomSummaryCard key={room.roomId} room={room} />)}
    </div>
  );
}

export function RoomSearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const rooms = useRoomSearchQuery({ query, limit: 20 });

  const items: RoomSummaryView[] = (rooms.data?.items ?? []).map((room) => ({
    ...room,
    displayStatus: room.displayStatus,
  }));
  const upcoming = items
    .filter((room) => room.displayStatus === "SCHEDULED" || room.displayStatus === "WAITING")
    .sort((left, right) => Date.parse(left.scheduledStartAt) - Date.parse(right.scheduledStartAt))
    .slice(0, 3);
  const available = items
    .filter((room) =>
      room.availability === "OPEN" &&
      ["DISCUSSING", "EXTENDED", "CLOSING"].includes(room.displayStatus),
    )
    .slice(0, 3);

  return (
    <main className="px-5 pb-20 sm:px-8">
      <section className="mx-auto max-w-[var(--layout-shell-max)] pt-14 sm:pt-20">
        <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="text-label mb-3 text-accent-strong">토론 찾기</p>
          <h1 className="text-display m-0">함께 읽을 토론을 찾아보세요</h1>
          <p className="text-body mx-auto mt-4 mb-8 max-w-xl text-muted-foreground">
            방 제목이나 책 제목, 저자로 검색할 수 있어요.
          </p>
          <SearchField initialQuery={query} />
        </header>

        {rooms.isPending && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="토론 불러오는 중" aria-busy="true">
            {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-surface-muted" />)}
          </div>
        )}

        {rooms.isError && (
          <section className="mx-auto grid max-w-md justify-items-center gap-4 py-16 text-center">
            <h2 className="text-section-title m-0">토론을 불러오지 못했습니다</h2>
            <p className="text-body m-0 text-muted-foreground">연결을 확인한 뒤 다시 시도해 주세요.</p>
            <Button onClick={() => void rooms.refetch()}>다시 시도</Button>
          </section>
        )}

        {rooms.isSuccess && query && (
          <section aria-labelledby="search-result-title">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 id="search-result-title" className="text-page-title m-0">검색 결과</h2>
              <span className="text-metadata text-muted-foreground">{items.length}개</span>
            </div>
            {items.length ? (
              <RoomGrid rooms={items} />
            ) : (
              <div className="grid justify-items-center gap-3 rounded-xl bg-surface py-16 text-center">
                <h3 className="text-section-title m-0">검색 결과가 없습니다</h3>
                <p className="text-body m-0 text-muted-foreground">다른 방 제목이나 책, 저자로 찾아보세요.</p>
              </div>
            )}
          </section>
        )}

        {rooms.isSuccess && !query && (
          <div className="grid gap-16">
            {upcoming.length > 0 && (
              <section aria-labelledby="upcoming-title">
                <h2 id="upcoming-title" className="text-page-title mb-6">곧 시작해요</h2>
                <RoomGrid rooms={upcoming} />
              </section>
            )}
            {available.length > 0 && (
              <section aria-labelledby="available-title">
                <h2 id="available-title" className="text-page-title mb-6">지금 참여 가능</h2>
                <RoomGrid rooms={available} />
              </section>
            )}
            {upcoming.length === 0 && available.length === 0 && (
              <section className="grid justify-items-center gap-4 rounded-xl bg-surface py-16 text-center">
                <h2 className="text-section-title m-0">열려 있는 토론이 없습니다</h2>
                <p className="text-body m-0 text-muted-foreground">읽고 싶은 책으로 먼저 토론을 열어보세요.</p>
                <Button asChild variant="primary"><Link to="/rooms/new">토론 만들기</Link></Button>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
