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
import type { ChartBar } from "@/shared/types/quote";

type IndexSparklineProps = {
  bars: ChartBar[];
  // 전일 종가 (부모가 snapshot 첫 봉의 close - change 로 유도).
  // null 이면 무채색 AreaSeries fallback (신규 지수 등 직전 세션 row 부재).
  prevClose: number | null;
  // useIndexIntraday failed[cellKey] 파생. IndexMiniChart 와 동일한 empty 문구
  // 정책으로 정렬 — 실패 시 안내 문구를 슬롯 내부에 표시.
  failed?: boolean;
  // 국내 개장 전(pre · preopen) 여부. 서버가 개장 전 국내 지수를 [] 로 반환하므로
  // empty 문구를 "장중 데이터 없음" 대신 "개장 전" 으로 대체.
  isPreopen?: boolean;
  // 부모 useIndexIntraday 첫 응답 도착 전 구간. bars=[] 로 empty 문구가 로딩 중
  // 플래시로 나지 않도록 국소 skeleton 으로 대체.
  isLoading?: boolean;
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

// 스택 모드 기본 높이. md+ 데스크톱 컨텍스트에서는 부모 높이 추종(md:h-full) —
// autoSize:true 가 ResizeObserver 로 세로 변화도 캔버스에 반영. 하한은 부모(MiniIndexCell
// 스파크라인 wrapper)의 md:min-h-[60px] 로 이 값을 재확인.
const BASE_HEIGHT_CLS = "h-[60px] md:h-full";

// time 은 벽시계(국내 KST · 해외 ET)를 UTC 로 위장한 epoch 초 → getUTC* 로
// 원본 시간대 컴포넌트를 복원한다. 아래 세션 필터도 자연스레 해당 캘린더 기준으로 동작.
const kstDateKey = (t: number): string => {
  const d = new Date(t * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

export const IndexSparkline = ({
  bars,
  prevClose,
  failed = false,
  isPreopen = false,
  isLoading = false,
}: IndexSparklineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // 마지막 봉의 KST 캘린더 날짜와 같은 세션만 유지 — 전일 데이터 섞임 방지.
  const sessionBars = useMemo(() => {
    if (bars.length === 0) return bars;
    const last = bars[bars.length - 1].time;
    if (typeof last !== "number") return bars;
    const lastKey = kstDateKey(last);
    return bars.filter(
      (b) => typeof b.time === "number" && kstDateKey(b.time) === lastKey,
    );
  }, [bars]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (sessionBars.length === 0) return;

    const palette = resolvedTheme === "dark" ? DARK : LIGHT;

    // autoscaleInfoProvider 에서 prevClose 도 포함시켜 price line 이
    // [min close, max close] 밖으로 벗어난 경우에도 잘리지 않게 한다.
    const pc = prevClose ?? 0;
    const hasPrevClose = pc > 0;

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
          baseValue: { type: "price", price: pc },
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
                minValue: Math.min(info.priceRange.minValue, pc),
                maxValue: Math.max(info.priceRange.maxValue, pc),
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
      sessionBars
        .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
        .map((b) => ({
          time: b.time as UTCTimestamp,
          value: b.close,
        })),
    );

    // 큰 차트 스타일 준용 — 대시 라인, 얇게, 축 라벨 없이 순수 시각 기준선.
    if (hasPrevClose) {
      series.createPriceLine({
        price: pc,
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
    // 리사이즈마다 rAF 로 병합해 fitContent 재호출. md:h-full 세로 변화도 동일 경로(의도).
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
  }, [sessionBars, prevClose, resolvedTheme]);

  // loading > empty 우선순위. IndexMiniChart 와 동일 정책·문구로 정렬 —
  // 하단 페어 셀에서 정보 상태(로딩·실패·개장 전·데이터 없음)를 값 영역과 대칭으로 노출.
  if (isLoading && sessionBars.length === 0) {
    return (
      <div
        className={`w-full animate-pulse rounded bg-muted ${BASE_HEIGHT_CLS}`}
        aria-hidden
      />
    );
  }
  if (failed || sessionBars.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-micro text-muted-foreground ${BASE_HEIGHT_CLS}`}
      >
        {failed
          ? "차트를 불러오지 못했어요"
          : isPreopen
            ? "개장 전"
            : "장중 데이터 없음"}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden ${BASE_HEIGHT_CLS}`}
      aria-hidden
    />
  );
};
