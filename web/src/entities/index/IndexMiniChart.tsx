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
import { crosshairLocalization } from "@/shared/constants/chart";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

type IndexMiniChartProps = {
  bars: IndexIntradaySnapshot[];
  // useIndexIntraday failed[cellKey] 파생 — bars 는 실패/preopen 모두 [] 이므로 구분 신호 필수.
  failed: boolean;
  // 부모 useIndexIntraday 첫 응답 도착 전 구간. quote 훅이 먼저 도착해도
  // bars=[] 로 "장중 데이터 없음" 플래시가 나지 않도록 여기서 국소 placeholder 로 대체.
  isLoading: boolean;
};

type BaselinePalette = {
  bg: string;
  text: string;
  border: string;
  up: { line: string; fill1: string; fill2: string };
  down: { line: string; fill1: string; fill2: string };
  // flat: prevClose 미도착 시 AreaSeries fallback 용 무채색 톤.
  flat: { line: string; top: string; bottom: string };
};

// IndexChart 풀사이즈 · IndexSparkline 과 동일한 up/down hex. baseline 그라데이션:
// line 근처 fill1(진함) → baseline 근처 fill2(투명).
const LIGHT: BaselinePalette = {
  bg: "#ffffff",
  text: "#1a1a1a",
  border: "#e5e5e5",
  up: { line: "#dc2626", fill1: "rgba(220,38,38,0.28)", fill2: "rgba(220,38,38,0)" },
  down: { line: "#2563eb", fill1: "rgba(37,99,235,0.28)", fill2: "rgba(37,99,235,0)" },
  flat: { line: "#737373", top: "rgba(115,115,115,0.15)", bottom: "rgba(115,115,115,0)" },
};

const DARK: BaselinePalette = {
  bg: "#1a1a1a",
  text: "#f0f0f0",
  border: "rgba(255,255,255,0.1)",
  up: { line: "#ef4444", fill1: "rgba(239,68,68,0.28)", fill2: "rgba(239,68,68,0)" },
  down: { line: "#3b82f6", fill1: "rgba(59,130,246,0.28)", fill2: "rgba(59,130,246,0)" },
  flat: { line: "#a3a3a3", top: "rgba(163,163,163,0.15)", bottom: "rgba(163,163,163,0)" },
};

// 전일종가 기준선 색상 — IndexSparkline 과 동일 muted 톤. 축 라벨 없이 대시만.
const PREV_CLOSE_LINE_LIGHT = "rgba(0,0,0,0.28)";
const PREV_CLOSE_LINE_DARK = "rgba(255,255,255,0.28)";

// 데스크톱 대비 모바일 차트 높이·폰트 잠정 축소 — 반폭 셀에서 축 라벨의 플롯 잠식 최소화.
const HEIGHT_PX_DESKTOP = 140;
const HEIGHT_PX_MOBILE = 95;
const FONT_SIZE_MOBILE = 10;

// timestamp는 KST를 UTC로 위장한 epoch 초이므로 getUTC* 가 원래 KST 컴포넌트를 돌려준다.
const kstDateKey = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

export const IndexMiniChart = ({ bars, failed, isLoading }: IndexMiniChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const height = isMobile ? HEIGHT_PX_MOBILE : HEIGHT_PX_DESKTOP;

  // 미니는 한 세션(09:00–15:30)만. KIS가 직전 영업일 데이터까지 섞어 보내는 경우 마지막 bar 의
  // 날짜로 잘라낸다 — 장중엔 오늘, 장 마감 후엔 가장 최근 영업일 세션이 잡힌다.
  const sessionBars = useMemo(() => {
    if (bars.length === 0) return bars;
    const lastKey = kstDateKey(bars[bars.length - 1].timestamp);
    return bars.filter((b) => kstDateKey(b.timestamp) === lastKey);
  }, [bars]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (sessionBars.length === 0) return;

    const palette = resolvedTheme === "dark" ? DARK : LIGHT;

    // 전일종가 = close - change (같은 세션 봉에서 상수). IndexSparkline 과 동일 파생.
    const first = sessionBars[0];
    const prevClose = first.close - first.change;
    const hasPrevClose = prevClose > 0;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: "SUIT Variable, sans-serif",
        // 모바일 반폭 셀에서 가격축·시간축 라벨 폭·높이 축소.
        ...(isMobile ? { fontSize: FONT_SIZE_MOBILE } : {}),
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: palette.border },
      },
      crosshair: { mode: 1 },
      // 크로스헤어 라벨은 intraday 포맷 `MM-DD HH:mm` (shared/constants/chart).
      localization: crosshairLocalization(true),
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        // 모바일 반폭 셀에서 마지막 tick(15:30) 이 우측 여백 부족으로 렌더 스킵되어 소폭 여백 확보.
        ...(isMobile ? { rightOffset: 2 } : {}),
      },
      // 모바일 반폭 셀은 가격축 라벨이 값과 시각적으로 인접해 혼선 유발 → 축 숨김.
      // 현재가는 셀 상단 텍스트로 이미 표시.
      rightPriceScale: isMobile
        ? { visible: false }
        : { borderColor: palette.border },
      handleScroll: false,
      handleScale: false,
    });

    const priceFormat = { type: "price" as const, precision: 2, minMove: 0.01 };

    // BaselineSeries: baseValue 기준 위/아래 2색. hasPrevClose 미충족 시 AreaSeries
    // 무채색 fallback — IndexSparkline · PriceChart 동일 패턴.
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
          priceFormat,
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
          bottomColor: palette.flat.bottom,
          lineWidth: 2,
          priceFormat,
        });

    series.setData(
      sessionBars.map((b) => ({
        time: b.timestamp as UTCTimestamp,
        value: b.close,
      })),
    );

    // 전일종가 dashed line — IndexSparkline 과 동일 스타일. 축 라벨 없이 순수 시각 기준선.
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

    // autoSize 는 캔버스 픽셀만 추종하고 visible range 는 복원하지 않는다 —
    // 리사이즈마다 rAF 로 병합해 fitContent 재호출.
    let removed = false;
    let rafId = 0;
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (removed) return;
        chart.timeScale().fitContent();
      });
    });
    observer.observe(containerRef.current);

    return () => {
      removed = true;
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      chart.remove();
    };
  }, [sessionBars, resolvedTheme, isMobile]);

  if (isLoading && bars.length === 0) {
    return (
      <div
        className="w-full animate-pulse rounded bg-muted"
        style={{ height }}
        aria-hidden
      />
    );
  }
  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-micro text-muted-foreground"
        style={{ height }}
      >
        {failed ? "차트를 불러오지 못했어요" : "장중 데이터 없음"}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden"
      style={{ height }}
    />
  );
};
