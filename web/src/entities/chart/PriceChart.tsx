"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { CHART_THEME } from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";

type PriceChartProps = {
  bars: ChartBar[];
  precision: number; // 종목 0, 지수 2
  timeVisible?: boolean; // intraday만 true
  height?: number;
  interactive?: boolean;
};

const DEFAULT_HEIGHT = 300;

const toTime = (t: string | number): Time =>
  typeof t === "number"
    ? (t as UTCTimestamp)
    : (t as `${number}-${number}-${number}`);

export const PriceChart = ({
  bars,
  precision,
  timeVisible = false,
  height = DEFAULT_HEIGHT,
  interactive = true,
}: PriceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const c = resolvedTheme === "dark" ? CHART_THEME.dark : CHART_THEME.light;

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
      timeScale: {
        borderColor: c.border,
        timeVisible,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: c.border },
      handleScroll: interactive,
      handleScale: interactive,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderVisible: false,
      wickUpColor: c.up,
      wickDownColor: c.down,
      priceFormat: {
        type: "price",
        precision,
        minMove: 10 ** -precision,
      },
    });

    series.setData(
      bars.map((b) => ({
        time: toTime(b.time),
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
  }, [bars, precision, timeVisible, interactive, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-md"
      style={{ height }}
    />
  );
};
