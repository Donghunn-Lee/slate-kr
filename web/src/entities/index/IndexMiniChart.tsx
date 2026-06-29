"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

type IndexMiniChartProps = {
  bars: IndexIntradaySnapshot[];
};

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

const HEIGHT_PX = 140;

export const IndexMiniChart = ({ bars }: IndexMiniChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    if (bars.length === 0) return;

    const c = resolvedTheme === "dark" ? DARK : LIGHT;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: c.bg },
        textColor: c.text,
        fontFamily: "SUIT Variable, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: c.border },
      },
      crosshair: { mode: 1 },
      timeScale: {
        borderColor: c.border,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: c.border },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderVisible: false,
      wickUpColor: c.up,
      wickDownColor: c.down,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    series.setData(
      bars.map((b) => ({
        time: b.timestamp as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [bars, resolvedTheme]);

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height: HEIGHT_PX }}
      >
        장중 데이터 없음
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden"
      style={{ height: HEIGHT_PX }}
    />
  );
};
