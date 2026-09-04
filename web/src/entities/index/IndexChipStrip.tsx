"use client";

import { useEffect, useRef } from "react";
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

type IndexChipStripProps = {
  selected: IndexCode;
  onSelect: (code: IndexCode) => void;
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  className?: string;
};

const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export const IndexChipStrip = ({
  selected,
  onSelect,
  dailyByIndex,
  className,
}: IndexChipStripProps) => {
  const { data, isLoading } = useIndexQuotes();
  const overseasIntradayQuery = useOverseasIndexIntraday();
  const overseasQuotesQuery = useOverseasIndexQuotes();
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // 초기 마운트 및 selected 변경 시 선택 칩을 가시 영역으로. inline: "nearest" +
  // block: "nearest" 로 이미 보이는 축은 스크롤 유발 없음 — URL ?index= 초기값이
  // 스트립 밖(예: 해외 지수)일 때만 좌우 스크롤이 발생한다.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [selected]);

  const renderChip = (code: IndexCode) => {
    const meta = getIndexMeta(code);
    const isDomestic = meta.region === "domestic";
    const prices = dailyByIndex[code];
    const latestDaily =
      prices && prices.length > 0 ? prices[prices.length - 1] : null;
    const overseasBars = isOverseasIntradayCode(code)
      ? overseasIntradayQuery.data?.quotes[code] ?? []
      : [];
    const overseasLatestBar =
      overseasBars.length > 0 ? overseasBars[overseasBars.length - 1] : null;
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
      session: data?.session,
    });
    const isSelected = selected === code;
    const showSkeleton = isDomestic && isLoading && !cell;

    return (
      <button
        key={code}
        ref={isSelected ? selectedRef : undefined}
        type="button"
        onClick={() => onSelect(code)}
        aria-pressed={isSelected}
        className={cn(
          "flex shrink-0 flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
          isSelected
            ? "border-lavender-accent bg-lavender-bg shadow-slate-hover"
            : "border-subtle bg-elevated shadow-slate",
        )}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-caption font-medium">{INDEX_LABEL[code]}</span>
          <span className="text-caption font-medium text-muted-foreground/80">
            {meta.overline}
          </span>
        </div>
        {showSkeleton ? (
          <div className="mt-0.5 h-3.5 w-16 animate-pulse rounded bg-muted" />
        ) : cell?.live ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-caption tabular-nums">
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
          <div className="flex items-baseline gap-1.5">
            <span className="text-caption tabular-nums">
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
          <span className="text-micro text-muted-foreground">데이터 없음</span>
        )}
      </button>
    );
  };

  // 국내/해외 그룹 사이에만 세로 헤어라인 1개. 그룹 라벨 없음 — 시각적 리듬만 준다.
  // -mx-4 px-4 로 페이지 px-4 를 넘어 뷰포트 edge 까지 스크롤 영역 확장,
  // rest 상태의 첫/마지막 칩은 페이지 콘텐츠 폭 안에 정렬.
  return (
    <nav
      aria-label="지수 선택"
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto scrollbar-slim px-4 pb-2",
        className,
      )}
    >
      {DOMESTIC_INDEX_CODES.map((code) => renderChip(code))}
      <div
        aria-hidden
        className="w-px shrink-0 self-stretch bg-border"
      />
      {OVERSEAS_INDEX_CODES.map((code) => renderChip(code))}
    </nav>
  );
};
