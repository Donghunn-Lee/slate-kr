"use client";

import { useRef, useState } from "react";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { IndexCode } from "@/shared/constants/indices";
import type { PriceStats } from "@/shared/types/stock";
import { IndexRail } from "./IndexRail";
import { IndexDetailPane } from "./IndexDetailPane";

type IndexBoardProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<IndexCode, PriceStats | null>;
  volumeByIndex: Record<IndexCode, number | null>;
  initialSelected: IndexCode;
};

const MOBILE_QUERY = "(max-width: 767px)";

export const IndexBoard = ({
  dailyByIndex,
  statsByIndex,
  volumeByIndex,
  initialSelected,
}: IndexBoardProps) => {
  const [selected, setSelected] = useState<IndexCode>(initialSelected);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const handleSelect = (code: IndexCode) => {
    setSelected(code);
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `/stocks/indices?index=${code}`);
    // 모바일에선 상세 pane 이 rail 위에 있지만 스크롤이 하단에 걸려있을 수 있어
    // 선택 시 상단으로 재정렬한다. 데스크톱은 스왑만 되므로 스크롤 유지.
    if (window.matchMedia(MOBILE_QUERY).matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <div
        ref={detailRef}
        className="order-1 min-w-0 flex-1 md:order-2"
      >
        <IndexDetailPane
          selected={selected}
          dailyByIndex={dailyByIndex}
          statsByIndex={statsByIndex}
          volumeByIndex={volumeByIndex}
        />
      </div>
      <aside className="order-2 md:order-1 md:w-[260px] md:shrink-0">
        <IndexRail
          selected={selected}
          onSelect={handleSelect}
          dailyByIndex={dailyByIndex}
        />
      </aside>
    </div>
  );
};
