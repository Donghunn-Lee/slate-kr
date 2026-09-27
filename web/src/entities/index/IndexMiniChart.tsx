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
import {
  CHART_THEME,
  INDEX_MINI_MIN_BAR_SPACING,
  crosshairLocalization,
} from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";
import { notoSansKr } from "@/shared/fonts";

type IndexMiniChartProps = {
  bars: ChartBar[];
  // 전일 종가 (IndexSlate 에서 snapshot 첫 봉의 close - change 로 유도).
  // null 이면 무채색 fallback (신규 지수 등 직전 세션 row 부재).
  prevClose: number | null;
  // useIndexIntraday failed[cellKey] 파생 — bars 는 실패/preopen 모두 [] 이므로 구분 신호 필수.
  failed: boolean;
  // 부모 useIndexIntraday 첫 응답 도착 전 구간. quote 훅이 먼저 도착해도
  // bars=[] 로 "장중 데이터 없음" 플래시가 나지 않도록 여기서 국소 placeholder 로 대체.
  isLoading: boolean;
  // 국내 개장 전 창(08:00~09:00) 여부. 빈 empty 문구를 "장중 데이터 없음" 대신
  // "개장전" 으로 대체.
  isPreopen?: boolean;
  // 그릴 세션의 거래일 'YYYY-MM-DD' (KST). 미전달 시 마지막 봉 날짜로 폴백.
  tradingDate?: string;
  // 부모 트리의 모바일 레이아웃(<md) 여부 — 축·폰트 축소를 레이아웃 분기점과 맞춘다.
  compact: boolean;
};

// 높이는 갖지 않는다 — 컨테이너를 100% 채우고(autoSize) 높이 결정은 부모
// (IndexSlate IndexCell 의 차트 영역 클래스) 한 곳에 둔다.
// 데스크톱 대비 모바일 폰트 잠정 축소 — 반폭 셀에서 축 라벨의 플롯 잠식 최소화.
const FONT_SIZE_MOBILE = 10;

// 기본 top 0.2 는 플롯 상단 1/5 이 빈 행. 2px 선 절반 + 크로스헤어 마커 반경 4 = 5px 을
// 100px 대 플롯 높이 비율로 환산해 상하 대칭 적용 — 극값에서 선·마커가 잘리지 않는 최소.
const PRICE_SCALE_MARGINS = { top: 0.05, bottom: 0.05 };

// time 은 KST를 UTC로 위장한 epoch 초이므로 getUTC* 가 원래 KST 컴포넌트를 돌려준다.
// tradingDate 와 직접 비교하도록 'YYYY-MM-DD' 로 맞춘다.
const kstDateKey = (t: number): string => {
  const d = new Date(t * 1000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
};

export const IndexMiniChart = ({
  bars,
  prevClose,
  failed,
  isLoading,
  isPreopen = false,
  tradingDate,
  compact,
}: IndexMiniChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // 미니는 한 세션(09:00–15:30)만. 축은 거래일 — 서버가 전일 tail 까지 함께 서빙하므로
  // 마지막 봉 날짜로 자르면 개장 전(08:00~09:00)에 전일 세션이 오늘로 오독된다.
  const sessionBars = useMemo(() => {
    if (bars.length === 0) return bars;
    const last = bars[bars.length - 1].time;
    if (typeof last !== "number") return bars;
    const key = tradingDate ?? kstDateKey(last);
    return bars.filter(
      (b) => typeof b.time === "number" && kstDateKey(b.time) === key,
    );
  }, [bars, tradingDate]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (sessionBars.length === 0) return;

    const palette = resolvedTheme === "dark" ? CHART_THEME.dark : CHART_THEME.light;

    const pc = prevClose ?? 0;
    const hasPrevClose = pc > 0;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: notoSansKr.style.fontFamily,
        // 모바일 반폭 셀에서 가격축·시간축 라벨 폭·높이 축소.
        ...(compact ? { fontSize: FONT_SIZE_MOBILE } : {}),
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
        minBarSpacing: INDEX_MINI_MIN_BAR_SPACING,
        // 모바일 반폭 셀에서 마지막 tick(15:30) 이 우측 여백 부족으로 렌더 스킵되어 소폭 여백 확보.
        ...(compact ? { rightOffset: 2 } : {}),
      },
      // 모바일 반폭 셀은 가격축 라벨이 값과 시각적으로 인접해 혼선 유발 → 축 숨김.
      // 현재가는 셀 상단 텍스트로 이미 표시. scaleMargins 는 축이 숨겨져도 플롯 배치에 적용된다.
      rightPriceScale: {
        ...(compact ? { visible: false } : { borderColor: palette.border }),
        scaleMargins: PRICE_SCALE_MARGINS,
      },
      handleScroll: false,
      handleScale: false,
    });

    const priceFormat = { type: "price" as const, precision: 2, minMove: 0.01 };

    // BaselineSeries: baseValue 기준 위/아래 2색. hasPrevClose 미충족 시 AreaSeries
    // 무채색 fallback — PriceChart 동일 패턴.
    const series = hasPrevClose
      ? chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: pc },
          topLineColor: palette.up,
          bottomLineColor: palette.down,
          topFillColor1: palette.baseline.topFill1,
          topFillColor2: palette.baseline.topFillClear,
          bottomFillColor1: palette.baseline.bottomFill1,
          bottomFillColor2: palette.baseline.bottomFillClear,
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
                minValue: Math.min(info.priceRange.minValue, pc),
                maxValue: Math.max(info.priceRange.maxValue, pc),
              },
            };
          },
        })
      : chart.addSeries(AreaSeries, {
          lineColor: palette.neutralLine,
          topColor: palette.neutralTopFill,
          bottomColor: palette.neutralBottomFill,
          lineWidth: 2,
          priceFormat,
        });

    series.setData(
      sessionBars
        .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
        .map((b) => ({
          time: b.time as UTCTimestamp,
          value: b.close,
        })),
    );

    // 전일종가 dashed line — 축 라벨 없이 순수 시각 기준선.
    if (hasPrevClose) {
      series.createPriceLine({
        price: pc,
        color: palette.prevCloseLine,
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

    // 캔버스 텍스트는 폰트 로드 후 자동으로 다시 그려지지 않는다 — 첫 페인트가 로드 전이면
    // 축 라벨이 대체 글꼴로 남으므로 로드 완료 후 1회 재그리기.
    document.fonts.ready.then(() => {
      if (!removed) chart.applyOptions({ layout: { fontFamily: notoSansKr.style.fontFamily } });
    });

    return () => {
      removed = true;
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      chart.remove();
    };
  }, [sessionBars, prevClose, resolvedTheme, compact]);

  if (isLoading && sessionBars.length === 0) {
    return (
      <div className="h-full w-full animate-pulse rounded bg-muted" aria-hidden />
    );
  }
  if (sessionBars.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-micro text-muted-foreground">
        {failed ? "차트를 불러오지 못했어요" : isPreopen ? "개장전" : "장중 데이터 없음"}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
};
