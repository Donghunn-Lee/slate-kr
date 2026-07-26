"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  AreaSeries,
  BaselineSeries,
  LineStyle,
  type AutoscaleInfo,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

type IndexSparklineProps = {
  bars: IndexIntradaySnapshot[];
  // useIndexIntraday failed[cellKey] 파생 — 실패면 빈 슬롯으로 두어 텍스트 블록 무영향.
  failed?: boolean;
};

// 전일종가 기준 위/아래 2색. IndexMiniChart · PriceChart 팔레트와 동일 hex.
// baseline 그라데이션: line 근처 fill1(진함) → baseline 근처 fill2(투명) 로 소멸.
// flat: prevClose 미도착 시 AreaSeries fallback 용 무채색 톤.
type BaselinePalette = {
  up: { line: string; fill1: string; fill2: string };
  down: { line: string; fill1: string; fill2: string };
  flat: { line: string; top: string };
};
const LIGHT: BaselinePalette = {
  up: { line: "#dc2626", fill1: "rgba(220,38,38,0.28)", fill2: "rgba(220,38,38,0)" },
  down: { line: "#2563eb", fill1: "rgba(37,99,235,0.28)", fill2: "rgba(37,99,235,0)" },
  flat: { line: "#737373", top: "rgba(115,115,115,0.20)" },
};
const DARK: BaselinePalette = {
  up: { line: "#ef4444", fill1: "rgba(239,68,68,0.28)", fill2: "rgba(239,68,68,0)" },
  down: { line: "#3b82f6", fill1: "rgba(59,130,246,0.28)", fill2: "rgba(59,130,246,0)" },
  flat: { line: "#a3a3a3", top: "rgba(163,163,163,0.20)" },
};

// 전일종가 기준선 색상 — 무채색 muted. 축 라벨 없이 대시만.
const PREV_CLOSE_LINE_LIGHT = "rgba(0,0,0,0.28)";
const PREV_CLOSE_LINE_DARK = "rgba(255,255,255,0.28)";

const HEIGHT_PX = 60;

// timestamp 는 벽시계(국내 KST · 해외 ET)를 UTC 로 위장한 epoch 초 → getUTC* 로
// 원본 시간대 컴포넌트를 복원한다. 아래 세션 필터도 자연스레 해당 캘린더 기준으로 동작.
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

    // 전일종가 = close - change (같은 세션 봉에서 상수). autoscaleInfoProvider 에서
    // series priceRange 로 clamp 하지 않고 prevClose 도 포함시켜, price line 이
    // [min close, max close] 밖으로 벗어난 경우에도 잘리지 않게 한다.
    const first = sessionBars[0];
    const prevClose = first.close - first.change;
    const hasPrevClose = prevClose > 0;

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

    // BaselineSeries: baseValue 기준 위(up)/아래(down) 2색. hasPrevClose 미충족
    // (신규 지수 등 직전 세션 row 부재) 시 AreaSeries 무채색 fallback — PriceChart 동일 패턴.
    const series = hasPrevClose
      ? chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: prevClose },
          topLineColor: palette.up.line,
          bottomLineColor: palette.down.line,
          topFillColor1: palette.up.fill1,
          topFillColor2: palette.up.fill2,
          bottomFillColor1: palette.down.fill1,
          bottomFillColor2: palette.down.fill2,
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: (
            original: () => AutoscaleInfo | null,
          ): AutoscaleInfo | null => {
            const info = original();
            if (!info || !info.priceRange) return info;
            return {
              ...info,
              priceRange: {
                minValue: Math.min(info.priceRange.minValue, prevClose),
                maxValue: Math.max(info.priceRange.maxValue, prevClose),
              },
            };
          },
        })
      : chart.addSeries(AreaSeries, {
          lineColor: palette.flat.line,
          topColor: palette.flat.top,
          bottomColor: "transparent",
          lineWidth: 2,
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

    // 큰 차트 스타일 준용 — 대시 라인, 얇게, 축 라벨 없이 순수 시각 기준선.
    if (hasPrevClose) {
      series.createPriceLine({
        price: prevClose,
        color:
          resolvedTheme === "dark" ? PREV_CLOSE_LINE_DARK : PREV_CLOSE_LINE_LIGHT,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: false,
        title: "",
      });
    }

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
