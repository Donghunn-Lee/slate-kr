"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { createChart, AreaSeries, type UTCTimestamp } from "lightweight-charts";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

type IndexMiniChartProps = {
  bars: IndexIntradaySnapshot[];
};

type Trend = "up" | "down" | "flat";

type LinePalette = {
  bg: string;
  text: string;
  border: string;
  line: Record<Trend, { line: string; top: string; bottom: string }>;
};

// IndexChart 풀사이즈와 동일한 up/down hex. 면 그라데이션은 라인 색의 알파 변형.
const LIGHT: LinePalette = {
  bg: "#ffffff",
  text: "#1a1a1a",
  border: "#e5e5e5",
  line: {
    up: { line: "#dc2626", top: "rgba(220,38,38,0.18)", bottom: "rgba(220,38,38,0)" },
    down: { line: "#2563eb", top: "rgba(37,99,235,0.18)", bottom: "rgba(37,99,235,0)" },
    flat: { line: "#737373", top: "rgba(115,115,115,0.15)", bottom: "rgba(115,115,115,0)" },
  },
};

const DARK: LinePalette = {
  bg: "#1a1a1a",
  text: "#f0f0f0",
  border: "rgba(255,255,255,0.1)",
  line: {
    up: { line: "#ef4444", top: "rgba(239,68,68,0.20)", bottom: "rgba(239,68,68,0)" },
    down: { line: "#3b82f6", top: "rgba(59,130,246,0.20)", bottom: "rgba(59,130,246,0)" },
    flat: { line: "#a3a3a3", top: "rgba(163,163,163,0.15)", bottom: "rgba(163,163,163,0)" },
  },
};

const HEIGHT_PX = 140;

const trendOf = (change: number): Trend => {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
};

export const IndexMiniChart = ({ bars }: IndexMiniChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    if (bars.length === 0) return;

    const palette = resolvedTheme === "dark" ? DARK : LIGHT;
    const trend = trendOf(bars[bars.length - 1].change);
    const colors = palette.line[trend];

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: "SUIT Variable, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: palette.border },
      },
      crosshair: { mode: 1 },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: palette.border },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      topColor: colors.top,
      bottomColor: colors.bottom,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    series.setData(
      bars.map((b) => ({
        time: b.timestamp as UTCTimestamp,
        value: b.close,
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
