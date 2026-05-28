"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { createChart, AreaSeries } from "lightweight-charts";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { StockPanel } from "./StockPanel";

type StockChartProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
};

const LIGHT = {
  bg: "#ffffff",
  text: "#1a1a1a",
  border: "#e5e5e5",
  line: "#525252",
  topFill: "rgba(82,82,82,0.15)",
  bottomFill: "rgba(82,82,82,0)",
} as const;

const DARK = {
  bg: "#1a1a1a",
  text: "#f0f0f0",
  border: "rgba(255,255,255,0.1)",
  line: "#a3a3a3",
  topFill: "rgba(163,163,163,0.15)",
  bottomFill: "rgba(163,163,163,0)",
} as const;

export const StockChart = ({ prices, ticker, label, viewAllHref }: StockChartProps) => {
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
      },
      grid: {
        vertLines: { color: c.border },
        horzLines: { color: c.border },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: c.border },
      rightPriceScale: { borderColor: c.border },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: c.line,
      topColor: c.topFill,
      bottomColor: c.bottomFill,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    areaSeries.setData(
      sorted.map((p) => ({
        time: p.date as `${number}-${number}-${number}`,
        value: p.close,
      }))
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [prices, resolvedTheme]);

  if (prices.length === 0) {
    return (
      <StockPanel noBorder>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">차트</h2>
        <p className="text-sm text-muted-foreground">가격 데이터 없음</p>
      </StockPanel>
    );
  }

  return (
    <StockPanel noBorder>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {ticker} — {label ?? "최근 1년"}
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-muted-foreground hover:underline">
            전체 보기 →
          </Link>
        )}
      </div>
      <div ref={containerRef} className="h-[300px] w-full" />
    </StockPanel>
  );
};
