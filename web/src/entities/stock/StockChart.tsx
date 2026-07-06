"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
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

  const bars = useMemo<ChartBar[]>(() => {
    const eod = toBars(prices);
    const quote = data?.quote;
    const date = data?.date;
    if (!quote || !date) return eod;

    const last = eod[eod.length - 1];
    // 오늘 봉 volume: 라이브 quote 의 acml_vol(누적 거래량) 우선.
    // EOD 오늘 봉이 있으면 그 volume 을 fallback 으로 유지 (quote 결측 시 안전망).
    const preservedVolume = last && last.time === date ? last.volume : undefined;
    const liveBar: ChartBar = {
      time: date,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.price,
      volume: quote.volume ?? preservedVolume,
    };
    // EOD 적재분에 오늘이 이미 있으면 실시간 값으로 교체(장 마감 후 재적재 중복 방지).
    if (last && last.time === date) return [...eod.slice(0, -1), liveBar];
    return [...eod, liveBar];
  }, [prices, data]);

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
