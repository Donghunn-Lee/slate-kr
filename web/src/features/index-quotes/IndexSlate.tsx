"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexMiniChart } from "@/entities/index/IndexMiniChart";
import { IndexSparkline } from "@/entities/index/IndexSparkline";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";
import { useIndexQuotes, type IndexCellData } from "./useIndexQuotes";
import { useIndexIntraday } from "./useIndexIntraday";

type IndexSlateProps = {
  // 해외 EOD 행을 서버에서 SSR 해서 넘긴다. client인 이 컴포넌트가 server child 를 감싸는 정형 패턴.
  overseasSlot?: ReactNode;
};

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
};

const IndexCell = ({ label, cell, bars, intradayFailed }: IndexCellProps) => (
  <div className="flex flex-col gap-3 px-6 py-4">
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
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

// 3열 미니 셀: 좌 텍스트 · 우 스파크라인(#093 목업). 데이터는 국내 live quote 와
// useIndexIntraday 봉을 공유. 실패/빈봉이면 스파크라인만 비워두어 텍스트 무영향.
type MiniIndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
};

const MiniIndexCell = ({ label, cell, bars, intradayFailed }: MiniIndexCellProps) => (
  <div className="flex flex-1 items-center justify-between gap-3 px-6 py-3">
    <div className="flex flex-col">
      <div className="text-sm text-muted-foreground">{label}</div>
      {cell.live ? (
        <div className="mt-0.5 flex flex-col items-start gap-0.5">
          <span className="text-xl font-medium tabular-nums">
            <PriceCountUp from={cell.live.price} to={cell.live.price} />
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="xs"
          />
        </div>
      ) : cell.fallback ? (
        <div className="mt-0.5 flex flex-col items-start gap-0.5">
          <span className="text-xl font-medium tabular-nums">
            {cell.fallback.close.toLocaleString("ko-KR")}
          </span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="xs"
          />
        </div>
      ) : (
        <div className="mt-0.5 text-sm text-muted-foreground">데이터 없음</div>
      )}
    </div>
    <div className="w-[78px] shrink-0">
      <IndexSparkline bars={bars} failed={intradayFailed} />
    </div>
  </div>
);

const CellSkeleton = ({ label }: { label: string }) => (
  <div className="px-6 py-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
  </div>
);

const MiniCellSkeleton = ({ label }: { label: string }) => (
  <div className="flex flex-1 flex-col justify-center px-6 py-3">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="mt-1 h-5 w-20 animate-pulse rounded bg-muted" />
  </div>
);

const MiniCellStackSkeleton = () => (
  <div className="flex flex-col divide-y divide-border/60">
    <MiniCellSkeleton label="코스피200" />
    <MiniCellSkeleton label="코스닥150" />
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

export const IndexSlate = ({ overseasSlot }: IndexSlateProps = {}) => {
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
            <MiniCellStackSkeleton />
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
            <div className="flex flex-col divide-y divide-border/60">
              <MiniIndexCell
                label="코스피200"
                cell={data.quotes.kospi200}
                bars={intraday?.quotes.kospi200 ?? EMPTY_BARS}
                intradayFailed={intraday?.failed.kospi200 ?? false}
              />
              <MiniIndexCell
                label="코스닥150"
                cell={data.quotes.kosdaq150}
                bars={intraday?.quotes.kosdaq150 ?? EMPTY_BARS}
                intradayFailed={intraday?.failed.kosdaq150 ?? false}
              />
            </div>
          </div>
        )}
        {overseasSlot && (
          <div className="border-t border-border/60 pb-2">{overseasSlot}</div>
        )}
      </StockPanel>
    </section>
  );
};
