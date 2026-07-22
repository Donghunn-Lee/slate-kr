"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexMiniChart } from "@/entities/index/IndexMiniChart";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";
import { useIndexQuotes, type IndexCellData } from "./useIndexQuotes";
import { useIndexIntraday } from "./useIndexIntraday";

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
};

const IndexCell = ({ label, cell, bars, intradayFailed }: IndexCellProps) => (
  <div className="flex flex-col gap-3 px-6 py-4">
    <div>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      {cell.live ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-medium tabular-nums">
            <PriceCountUp from={cell.live.price} to={cell.live.price} />
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="sm"
          />
        </div>
      ) : cell.fallback ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-medium tabular-nums">
            {cell.fallback.close.toLocaleString("ko-KR")}
          </span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="sm"
          />
          <span className="text-[11px] text-muted-foreground">직전 거래일</span>
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-muted-foreground">—</span>
          <span className="text-[13px] text-muted-foreground">데이터 없음</span>
        </div>
      )}
    </div>
    <IndexMiniChart bars={bars} failed={intradayFailed} />
  </div>
);

const CellSkeleton = ({ label }: { label: string }) => (
  <div className="px-6 py-4">
    <div className="text-[13px] text-muted-foreground">{label}</div>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
  </div>
);

const MarketStatus = ({ marketOpen, date }: { marketOpen: boolean; date?: string }) =>
  marketOpen ? (
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
      실시간
    </div>
  ) : (
    <div className="text-[13px] text-muted-foreground">
      15:30 장 마감{date ? ` · 기준일 ${date}` : ""}
    </div>
  );

const GRID_CLASS =
  "grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0";

const EMPTY_BARS: IndexIntradaySnapshot[] = [];

export const IndexSlate = () => {
  const { data, isLoading, isError } = useIndexQuotes();
  const { data: intraday } = useIndexIntraday();

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-end gap-3">
          <h2 className="text-lg font-semibold text-foreground">주요 지수</h2>
          {data ? (
            <MarketStatus
              marketOpen={data.marketOpen}
              date={data.quotes.kospi.fallback?.date}
            />
          ) : null}
        </div>
        <Link
          href="/stocks/indices"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <StockPanel className="p-0">
        {isError && !data ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            지수 시세를 불러오지 못했습니다
          </div>
        ) : isLoading || !data ? (
          <div className={GRID_CLASS}>
            <CellSkeleton label="코스피" />
            <CellSkeleton label="코스닥" />
            <CellSkeleton label="코스피200" />
          </div>
        ) : (
          <div className={GRID_CLASS}>
            <IndexCell
              label="코스피"
              cell={data.quotes.kospi}
              bars={intraday?.quotes.kospi ?? EMPTY_BARS}
              intradayFailed={intraday?.failed.kospi ?? false}
            />
            <IndexCell
              label="코스닥"
              cell={data.quotes.kosdaq}
              bars={intraday?.quotes.kosdaq ?? EMPTY_BARS}
              intradayFailed={intraday?.failed.kosdaq ?? false}
            />
            <IndexCell
              label="코스피200"
              cell={data.quotes.kospi200}
              bars={intraday?.quotes.kospi200 ?? EMPTY_BARS}
              intradayFailed={intraday?.failed.kospi200 ?? false}
            />
          </div>
        )}
      </StockPanel>
    </section>
  );
};
