"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { cn } from "@/lib/utils";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";
type Tab = "intraday" | "day" | "month";

type IndexChartProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[]; // ASC
  interactive?: boolean;
};

const POLL_INTERVAL_MS = 60_000;

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

const TAB_LABEL: Record<Tab, string> = {
  intraday: "당일",
  day: "일봉",
  month: "월봉",
};

type IntradayResponse = {
  quotes: Record<"kospi" | "kosdaq" | "kospi200", IndexIntradaySnapshot[]>;
  marketOpen: boolean;
};

export const IndexChart = ({ indexCode, prices, interactive = true }: IndexChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("intraday");
  const [intraday, setIntraday] = useState<IndexIntradaySnapshot[] | null>(null);

  const monthlyPrices = useMemo(() => resampleToMonthly(prices), [prices]);

  // intraday 탭일 때만 60초 폴링. data.marketOpen=false 면 다음 호출을 스케줄하지 않아 자체 정지.
  useEffect(() => {
    if (tab !== "intraday") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/index-intraday");
        if (!res.ok) return;
        const data = (await res.json()) as IntradayResponse;
        if (cancelled) return;
        const key = indexCode.toLowerCase() as keyof IntradayResponse["quotes"];
        setIntraday(data.quotes[key] ?? []);
        if (data.marketOpen) {
          timer = setTimeout(load, POLL_INTERVAL_MS);
        }
      } catch {
        // 네트워크 실패는 조용히 무시 — 탭 재진입/마운트 시 재시도.
      }
    };

    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tab, indexCode]);

  // intraday 데이터 없으면 day 로 silent fallback (preopen/장 마감 시간대).
  const intradayHasData = intraday !== null && intraday.length > 0;
  const renderMode: "intraday" | "day" | "month" =
    tab === "intraday" ? (intradayHasData ? "intraday" : "day") : tab;

  useEffect(() => {
    if (!containerRef.current) return;
    const isIntraday = renderMode === "intraday";

    if (isIntraday && (!intraday || intraday.length === 0)) return;
    if (!isIntraday && prices.length === 0) return;

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
      timeScale: {
        borderColor: c.border,
        timeVisible: isIntraday,
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
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    if (isIntraday) {
      series.setData(
        intraday!.map((p) => ({
          time: p.timestamp as UTCTimestamp,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        })),
      );
    } else {
      const source = renderMode === "month" ? monthlyPrices : prices;
      series.setData(
        source.map((p) => ({
          time: p.date as `${number}-${number}-${number}`,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        })),
      );
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [renderMode, intraday, monthlyPrices, prices, resolvedTheme, interactive]);

  if (prices.length === 0 && !intradayHasData) {
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
        <div
          className="flex gap-1"
          role="tablist"
          aria-label={`${INDEX_LABEL[indexCode]} 차트 주기`}
        >
          {(["intraday", "day", "month"] as Tab[]).map((t) => (
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
                  : "text-muted-foreground hover:text-foreground",
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
