"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createChart, CandlestickSeries } from "lightweight-charts";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { cn } from "@/lib/utils";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";

type IndexChartProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[]; // ASC
  interactive?: boolean;
};

type Tab = "day" | "month";

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

const INDEX_LABEL: Record<IndexCode, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  KOSPI200: "코스피200",
};

const TAB_LABEL: Record<Tab, string> = { day: "일봉", month: "월봉" };

export const IndexChart = ({ indexCode, prices, interactive = true }: IndexChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("day");

  const monthlyPrices = useMemo(() => resampleToMonthly(prices), [prices]);
  const data = tab === "day" ? prices : monthlyPrices;

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

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
        vertLines: { color: c.border },
        horzLines: { color: c.border },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: c.border },
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
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    series.setData(
      data.map((p) => ({
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
  }, [data, resolvedTheme, interactive]);

  if (prices.length === 0) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {INDEX_LABEL[indexCode]}
        </h2>
        <p className="text-sm text-muted-foreground">차트 데이터 없음</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {INDEX_LABEL[indexCode]}
        </h2>
        <div className="flex gap-1" role="tablist" aria-label={`${INDEX_LABEL[indexCode]} 차트 주기`}>
          {(["day", "month"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                tab === t
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-[300px] w-full overflow-hidden rounded-md" />
    </>
  );
};
