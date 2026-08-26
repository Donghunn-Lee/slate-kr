"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import {
  defaultMarketForSession,
  getKrxSessionState,
  isKrxBeforeMarketOpen,
} from "@/shared/utils/market";
import { mergeLiveDayBar } from "@/shared/utils/mergeLiveDayBar";
import type { ChartBar } from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";

// 미니차트(종합정보 탭) 고정 높이 — 잠정치, 실물 확인 후 조정 여지.
const MINI_CHART_HEIGHT_MOBILE = 170;
const MINI_CHART_HEIGHT_DESKTOP = 300;

type StockChartProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
  // true 면 subscribeOnly 캐시 키를 세션 기본 market 으로 정렬한다.
  nxEligible: boolean | null;
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
  nxEligible,
}: StockChartProps) => {
  // 헤더 폴링 캐시를 subscribe (네트워크 추가 0). NXT 취급 종목은 시장 축 정합을 위해
  // 세션 기본 market 을 명시.
  const subscribeMarket = nxEligible === true ? defaultMarketForSession(getKrxSessionState()) : undefined;
  const { data } = useStockQuote(ticker, { subscribeOnly: true, market: subscribeMarket });
  const isMobile = useIsMobile();

  const bars = useMemo<ChartBar[]>(() => {
    // 정규장 개장 전(pre · preopen)엔 quote를 null로 게이트 — StockChartTabs 와 동형.
    const gatedQuote = isKrxBeforeMarketOpen(data?.session)
      ? null
      : data?.quote ?? null;
    return mergeLiveDayBar(toBars(prices), gatedQuote, data?.date);
  }, [prices, data]);

  if (prices.length === 0) {
    return (
      <>
        <h2 className="mb-3 text-body font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-body text-muted-foreground">가격 데이터 없음</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold text-muted-foreground">
          가격 차트
          {label && (
            <span className="ml-1.5 text-caption font-normal text-muted-foreground/70">· {label}</span>
          )}
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-caption text-muted-foreground hover:underline">
            전체 보기 →
          </Link>
        )}
      </div>
      <PriceChart
        bars={bars}
        precision={0}
        interactive={interactive}
        showVolume
        height={isMobile ? MINI_CHART_HEIGHT_MOBILE : MINI_CHART_HEIGHT_DESKTOP}
      />
    </>
  );
};
