"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PriceChange } from "@/shared/components/PriceChange";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import {
  DOMESTIC_INDEX_CODES,
  OVERSEAS_INDEX_CODES,
  INDEX_LABEL,
  getIndexMeta,
  isOverseasIntradayCode,
  type DomesticIndexCode,
  type IndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import { useOverseasIndexIntraday } from "@/features/index-quotes/useOverseasIndexIntraday";
import { useOverseasIndexQuotes } from "@/features/index-quotes/useOverseasIndexQuotes";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";
import { cn } from "@/lib/utils";

type IndexRailProps = {
  selected: IndexCode;
  onSelect: (code: IndexCode) => void;
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
};

type SectionKey = "domestic" | "overseas";

const SECTIONS: {
  key: SectionKey;
  label: string;
  codes: readonly IndexCode[];
}[] = [
  { key: "domestic", label: "국내", codes: DOMESTIC_INDEX_CODES },
  { key: "overseas", label: "해외", codes: OVERSEAS_INDEX_CODES },
];

const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export const IndexRail = ({
  selected,
  onSelect,
  dailyByIndex,
}: IndexRailProps) => {
  const { data, isLoading } = useIndexQuotes();
  // 해외 intraday 폴링. queryKey 는 DetailPane 과 동일 (["overseas-index-intraday"])
  // 이라 TanStack Query 가 dedup — Rail 추가로 인한 네트워크 비용 없음.
  const overseasIntradayQuery = useOverseasIndexIntraday();
  // 해외 quote 폴링 (8종 라이브). DetailPane·홈 IndexChipStrip 과 queryKey 공유 → dedup.
  const overseasQuotesQuery = useOverseasIndexQuotes();
  // 두 섹션 모두 기본 열림. 사용자가 접으면 그 상태를 유지 — 선택 지수가 있는
  // 섹션을 강제로 다시 열지는 않는다(선택 이동 자체는 하이라이트로 충분).
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    { domestic: true, overseas: true },
  );

  return (
    <nav aria-label="지수 목록" className="space-y-2">
      {SECTIONS.map(({ key, label, codes }) => (
        <Collapsible
          key={key}
          open={openSections[key]}
          onOpenChange={(o) =>
            setOpenSections((s) => ({ ...s, [key]: o }))
          }
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-1 py-2 text-left text-caption font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight
              className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90"
              aria-hidden
            />
            <span>{label}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <ul className="mt-1 flex flex-col gap-1">
              {codes.map((code) => {
                const meta = getIndexMeta(code);
                const isDomestic = meta.region === "domestic";
                const prices = dailyByIndex[code];
                const latestDaily =
                  prices && prices.length > 0
                    ? prices[prices.length - 1]
                    : null;
                // 해외 intraday(SPX/COMP/NDX): 최신 봉이 있으면 live 셀로 승격.
                // 그 외 해외 지수는 isOverseasIntradayCode=false → 항상 EOD fallback.
                const overseasBars = isOverseasIntradayCode(code)
                  ? overseasIntradayQuery.data?.quotes[code] ?? []
                  : [];
                const overseasLatestBar =
                  overseasBars.length > 0
                    ? overseasBars[overseasBars.length - 1]
                    : null;
                const cell = buildIndexCell({
                  isDomestic,
                  name: INDEX_LABEL[code],
                  domesticCell: isDomestic
                    ? data?.quotes[code as DomesticIndexCode]
                    : undefined,
                  overseasQuote: isDomestic
                    ? null
                    : overseasQuotesQuery.data?.quotes[
                        code as Exclude<IndexCode, DomesticIndexCode>
                      ] ?? null,
                  overseasLatestBar,
                  latestDaily,
                });
                const isSelected = selected === code;
                const showSkeleton = isDomestic && isLoading && !cell;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => onSelect(code)}
                      aria-pressed={isSelected}
                      className={cn(
                        // slate 3-state: rest 는 중립 elevated slate, hover 는 옅은 lavender wash,
                        // selected 는 우측 상세 pane 과 동일한 lavender-bg + lavender-accent 윤곽 +
                        // 강화 shadow — 선택 탭과 차트 pane 이 하나의 layer 로 읽히도록.
                        "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-lavender-accent bg-lavender-bg shadow-slate-hover"
                          : "border-subtle bg-elevated shadow-slate hover:bg-lavender-bg/50",
                      )}
                    >
                      <span className="text-micro font-medium uppercase tracking-widest text-muted-foreground">
                        {meta.overline}
                      </span>
                      <span className="text-body font-medium">
                        {INDEX_LABEL[code]}
                      </span>
                      {showSkeleton ? (
                        <div className="mt-0.5 h-4 w-24 animate-pulse rounded bg-muted" />
                      ) : cell?.live ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-body tabular-nums">
                            <PriceCountUp value={cell.live.price} />
                          </span>
                          <PriceChange
                            change={cell.live.change}
                            changeRate={cell.live.changeRate}
                            sign={cell.live.sign}
                            symbol="arrow"
                            size="xs"
                          />
                        </div>
                      ) : cell?.fallback ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-body tabular-nums">
                            {formatIndexPrice(cell.fallback.close)}
                          </span>
                          <PriceChange
                            change={cell.fallback.change}
                            changeRate={cell.fallback.changeRate}
                            symbol="arrow"
                            size="xs"
                          />
                        </div>
                      ) : (
                        <span className="text-caption text-muted-foreground">
                          데이터 없음
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </nav>
  );
};
