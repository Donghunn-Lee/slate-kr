"use client";

import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { useIndexQuotes, type IndexCellData } from "./useIndexQuotes";

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
};

const IndexCell = ({ label, cell }: IndexCellProps) => (
  <div className="px-6 py-4">
    <div className="text-[13px] text-muted-foreground">{label}</div>
    {cell.live ? (
      <>
        <div className="mt-1 text-2xl font-medium tabular-nums">
          <PriceCountUp from={cell.live.price} to={cell.live.price} />
        </div>
        <div className="mt-1">
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="sm"
          />
        </div>
      </>
    ) : cell.fallback ? (
      <>
        <div className="mt-1 text-2xl font-medium tabular-nums">
          {cell.fallback.close.toLocaleString("ko-KR")}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">직전 거래일</span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="sm"
          />
        </div>
      </>
    ) : (
      <>
        <div className="mt-1 text-2xl font-medium tabular-nums text-muted-foreground">—</div>
        <div className="mt-1 text-[13px] text-muted-foreground">데이터 없음</div>
      </>
    )}
  </div>
);

const CellSkeleton = ({ label }: { label: string }) => (
  <div className="px-6 py-4">
    <div className="text-[13px] text-muted-foreground">{label}</div>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
  </div>
);

const MarketStatus = ({ marketOpen }: { marketOpen: boolean }) =>
  marketOpen ? (
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
      실시간
    </div>
  ) : (
    <div className="text-[13px] text-muted-foreground">장 마감 · 종가 기준</div>
  );

const GRID_CLASS =
  "grid grid-cols-1 divide-y divide-border/60 border-t border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0";

export const IndexSlate = () => {
  const { data, isLoading, isError } = useIndexQuotes();

  return (
    <section className="mb-8">
      <StockPanel className="p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-[13px] font-medium text-muted-foreground">주요 지수</h2>
          {data ? <MarketStatus marketOpen={data.marketOpen} /> : null}
        </div>

        {isError && !data ? (
          <div className="border-t border-border/60 px-6 py-6 text-sm text-muted-foreground">
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
            <IndexCell label="코스피" cell={data.quotes.kospi} />
            <IndexCell label="코스닥" cell={data.quotes.kosdaq} />
            <IndexCell label="코스피200" cell={data.quotes.kospi200} />
          </div>
        )}
      </StockPanel>
    </section>
  );
};
