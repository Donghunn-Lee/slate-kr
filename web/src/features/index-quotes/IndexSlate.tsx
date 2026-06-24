"use client";

import type { IndexQuote, PriceSign } from "@/shared/types/quote";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { cn } from "@/lib/utils";
import { useIndexQuotes } from "./useIndexQuotes";

const signClass = (sign: PriceSign): string =>
  sign === "up"
    ? "text-price-up"
    : sign === "down"
      ? "text-price-down"
      : "text-muted-foreground";

const signSymbol = (sign: PriceSign): string =>
  sign === "up" ? "▲" : sign === "down" ? "▼" : "·";

type IndexCellProps = {
  label: string;
  quote: IndexQuote | null;
};

const IndexCell = ({ label, quote }: IndexCellProps) => (
  <div className="px-6 py-4">
    <div className="text-[13px] text-muted-foreground">{label}</div>
    {quote ? (
      <>
        <div className="mt-1 text-2xl font-medium tabular-nums">
          <PriceCountUp from={quote.price} to={quote.price} />
        </div>
        <div className={cn("mt-1 text-[13px] tabular-nums", signClass(quote.sign))}>
          {signSymbol(quote.sign)} {Math.abs(quote.change).toLocaleString("ko-KR")}
          {" ("}
          {quote.changeRate >= 0 ? "+" : ""}
          {quote.changeRate.toFixed(2)}%{")"}
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
            <IndexCell label="코스피" quote={data.quotes.kospi} />
            <IndexCell label="코스닥" quote={data.quotes.kosdaq} />
            <IndexCell label="코스피200" quote={data.quotes.kospi200} />
          </div>
        )}
      </StockPanel>
    </section>
  );
};
