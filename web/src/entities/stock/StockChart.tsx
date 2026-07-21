"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { mergeLiveDayBar } from "@/shared/utils/mergeLiveDayBar";
import type { ChartBar } from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";

type StockChartProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
};

// DB는 DESC → 차트는 ASC 필요.
const toBars = (prices: StockPriceSnapshot[]): ChartBar[] =>
  [...prices]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((p) => ({
      time: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));

export const StockChart = ({
  prices,
  ticker,
  label,
  viewAllHref,
  interactive = true,
}: StockChartProps) => {
  // 헤더가 이미 폴링 중이므로 subscribeOnly 로 캐시만 구독 → 네트워크 추가 0.
  const { data } = useStockQuote(ticker, { subscribeOnly: true });

  const bars = useMemo<ChartBar[]>(
    () => mergeLiveDayBar(toBars(prices), data?.quote ?? null, data?.date),
    [prices, data],
  );

  if (prices.length === 0) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">가격 데이터 없음</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          가격 차트
          {label && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground/70">· {label}</span>
          )}
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-muted-foreground hover:underline">
            전체 보기 →
          </Link>
        )}
      </div>
      <PriceChart bars={bars} precision={0} interactive={interactive} showVolume />
    </>
  );
};
