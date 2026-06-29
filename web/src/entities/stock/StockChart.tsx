"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { createChart, CandlestickSeries } from "lightweight-charts";
import type { StockPriceSnapshot } from "@/shared/types/stock";

type StockChartProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
};

// KR 관행: 상승=레드, 하락=블루. Tailwind red-600/blue-600 톤으로 globals.css의 oklch와 매칭.
const LIGHT = {
  bg: "#ffffff",
  text: "#1a1a1a",
  border: "#e5e5e5",
  up: "#dc2626",
  down: "#2563eb",
} as const;

const DARK = {
  bg: "#1a1a1a",
  text: "#f0f0f0",
  border: "rgba(255,255,255,0.1)",
  up: "#ef4444",
  down: "#3b82f6",
} as const;

export const StockChart = ({ prices, label, viewAllHref, interactive = true }: StockChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current || prices.length === 0) return;

    const c = resolvedTheme === "dark" ? DARK : LIGHT;

    // DB는 DESC 정렬 → chart는 ASC 필요
    const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: c.bg },
        textColor: c.text,
        fontFamily: "SUIT Variable, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: c.border },
        horzLines: { color: c.border },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: c.border },
      rightPriceScale: { borderColor: c.border },
      handleScroll: interactive,
      handleScale: interactive,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderVisible: false,
      wickUpColor: c.up,
      wickDownColor: c.down,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    candleSeries.setData(
      sorted.map((p) => ({
        time: p.date as `${number}-${number}-${number}`,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      }))
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [prices, resolvedTheme, interactive]);

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
      <div ref={containerRef} className="h-[300px] w-full overflow-hidden rounded-md" />
    </>
  );
};
