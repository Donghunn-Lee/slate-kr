"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

type IndexSparklineProps = {
  bars: IndexIntradaySnapshot[];
  // useIndexIntraday failed[cellKey] 파생 — 실패면 빈 슬롯으로 두어 텍스트 블록 무영향.
  failed?: boolean;
};

type Trend = "up" | "down" | "flat";

// IndexMiniChart 팔레트와 동일 hex — 상승/하락 톤 통일.
// 여기 co-locate 하는 이유: sparkline 은 라인 단색만 사용하고 gradient/border 필요 없어서
// 팔레트 shape 이 미니와 다르다. 공용화 시 dead 필드가 생겨 유지비만 증가.
const LIGHT: Record<Trend, string> = {
  up: "#dc2626",
  down: "#2563eb",
  flat: "#737373",
};
const DARK: Record<Trend, string> = {
  up: "#ef4444",
  down: "#3b82f6",
  flat: "#a3a3a3",
};

const HEIGHT_PX = 36;

const trendOf = (change: number): Trend => {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
};

// timestamp 는 KST 를 UTC 로 위장한 epoch 초 → getUTC* 로 원래 KST 컴포넌트를 얻는다.
const kstDateKey = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

export const IndexSparkline = ({ bars, failed = false }: IndexSparklineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // 마지막 봉의 KST 캘린더 날짜와 같은 세션만 유지 — 전일 데이터 섞임 방지.
  const sessionBars = useMemo(() => {
    if (bars.length === 0) return bars;
    const lastKey = kstDateKey(bars[bars.length - 1].timestamp);
    return bars.filter((b) => kstDateKey(b.timestamp) === lastKey);
  }, [bars]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (sessionBars.length === 0) return;

    const palette = resolvedTheme === "dark" ? DARK : LIGHT;
    const color = palette[trendOf(sessionBars[sessionBars.length - 1].change)];

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "transparent",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: { mode: 0, vertLine: { visible: false }, horzLine: { visible: false } },
      timeScale: { visible: false, borderVisible: false },
      rightPriceScale: { visible: false, borderVisible: false },
      leftPriceScale: { visible: false, borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    series.setData(
      sessionBars.map((b) => ({
        time: b.timestamp as UTCTimestamp,
        value: b.close,
      })),
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [sessionBars, resolvedTheme]);

  // 실패·데이터 없음 → 슬롯만 비워둠(레이아웃 유지, 텍스트 블록 무영향).
  if (failed || sessionBars.length === 0) {
    return <div style={{ height: HEIGHT_PX }} aria-hidden />;
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden"
      style={{ height: HEIGHT_PX }}
      aria-hidden
    />
  );
};
