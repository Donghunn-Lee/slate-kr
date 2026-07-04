"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  CHART_THEME,
  INTRADAY_PREV_LOOKBACK_SEC,
  type ChartPalette,
} from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";

type PriceChartProps = {
  bars: ChartBar[];
  precision: number; // 종목 0, 지수 2
  timeVisible?: boolean; // intraday만 true
  height?: number;
  interactive?: boolean;
  // 잠금 뷰: 스크롤/줌 차단 + 최신 봉 자동 추적. intraday 전용.
  locked?: boolean;
  // 이 값 미만 time 을 가진 봉을 흐린 색으로 렌더 (전일 세션 dim).
  dimBefore?: number;
  // 하단 20% overlay 로 거래량 histogram 을 함께 렌더. bars[i].volume 이 없는 봉은 스킵.
  showVolume?: boolean;
};

const DEFAULT_HEIGHT = 300;
const INTRADAY_BAR_BUFFER_SEC = 600; // 오른쪽 여유 = 10분봉 1개 폭

const toTime = (t: string | number): Time =>
  typeof t === "number"
    ? (t as UTCTimestamp)
    : (t as `${number}-${number}-${number}`);

// dimBefore 지정 시 time<dimBefore 봉에 per-bar 흐린 색 주입. 나머지는 시리즈 기본색.
const mapBar = (
  b: ChartBar,
  palette: ChartPalette,
  dimBefore: number | undefined,
) => {
  const base = {
    time: toTime(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
  if (
    dimBefore === undefined ||
    typeof b.time !== "number" ||
    b.time >= dimBefore
  ) {
    return base;
  }
  const dimColor = b.close >= b.open ? palette.dim.up : palette.dim.down;
  return {
    ...base,
    color: dimColor,
    wickColor: dimColor,
    borderColor: dimColor,
  };
};

// volume 히스토그램 포인트. volume 없는 봉은 null → 필터.
type VolumePoint = { time: Time; value: number; color: string };
const mapVolume = (b: ChartBar, palette: ChartPalette): VolumePoint | null => {
  if (b.volume === undefined) return null;
  return {
    time: toTime(b.time),
    value: b.volume,
    color: b.close >= b.open ? palette.volume.up : palette.volume.down,
  };
};

// locked 뷰의 가시 범위. from = (마지막 dim 봉 time) − LOOKBACK 로 고정, to = 최신 봉 + 소폭 추적.
// dim 봉이 없으면 첫 봉을 anchor 로.
const applyLockedRange = (
  chart: IChartApi,
  bars: ChartBar[],
  dimBefore: number | undefined,
) => {
  if (bars.length === 0) return;
  const last = bars[bars.length - 1].time;
  if (typeof last !== "number") return;

  let anchor: number | null = null;
  if (dimBefore !== undefined) {
    for (let i = bars.length - 1; i >= 0; i--) {
      const t = bars[i].time;
      if (typeof t === "number" && t < dimBefore) {
        anchor = t;
        break;
      }
    }
  }

  const first = bars[0].time;
  const from =
    anchor !== null
      ? anchor - INTRADAY_PREV_LOOKBACK_SEC
      : typeof first === "number"
        ? first
        : last;
  const to = last + INTRADAY_BAR_BUFFER_SEC;

  chart.timeScale().setVisibleRange({
    from: from as UTCTimestamp,
    to: to as UTCTimestamp,
  });
};

export const PriceChart = ({
  bars,
  precision,
  timeVisible = false,
  height = DEFAULT_HEIGHT,
  interactive = true,
  locked = false,
  dimBefore,
  showVolume = false,
}: PriceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const prevBarsRef = useRef<ChartBar[] | null>(null);
  const barsRef = useRef<ChartBar[]>(bars);

  const { resolvedTheme } = useTheme();

  // config effect 가 재실행될 때 최신 bars 로 초기화할 수 있도록 렌더 후 동기화.
  // 선언 순서상 config/data effect 보다 먼저 실행된다.
  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

  // 차트/시리즈는 config(테마·precision·timeVisible·interactive·locked·dimBefore) 변경 시에만
  // 재생성. bars-only 갱신은 아래 데이터 effect가 처리해 사용자 줌 상태를 유지한다.
  useEffect(() => {
    if (!containerRef.current) return;

    const c = resolvedTheme === "dark" ? CHART_THEME.dark : CHART_THEME.light;
    const scrollScale = interactive && !locked;

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
      handleScroll: scrollScale,
      handleScale: scrollScale,
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

    // 캔들 상단 여백은 유지, showVolume 이면 하단 여백을 확보해 histogram 이 겹치지 않게.
    chart.priceScale("right").applyOptions({
      scaleMargins: showVolume ? { top: 0.1, bottom: 0.25 } : { top: 0.1, bottom: 0.1 },
    });

    let volumeSeries: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      // priceScaleId: "" → 독립 invisible overlay scale. 캔들과 축을 공유하지 않음.
      volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale("").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    const initial = barsRef.current;
    if (initial.length > 0) {
      series.setData(initial.map((b) => mapBar(b, c, dimBefore)));
      if (volumeSeries) {
        const volData = initial
          .map((b) => mapVolume(b, c))
          .filter((p): p is VolumePoint => p !== null);
        volumeSeries.setData(volData);
      }
      if (locked) {
        applyLockedRange(chart, initial, dimBefore);
      } else {
        chart.timeScale().fitContent();
      }
    }
    prevBarsRef.current = initial;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      prevBarsRef.current = null;
    };
  }, [precision, timeVisible, interactive, resolvedTheme, locked, dimBefore, showVolume]);

  // bars-only 갱신. 첫 봉 time 동일 + length 동일/+1 → series.update 로 줌 유지.
  // 그 외(탭 전환 등 데이터셋 자체 변경) → setData + (locked: applyLockedRange, else: fitContent).
  // volume series 는 candle 과 동일 setData/update 경로에 편입 (인덱스 정합 유지).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const prev = prevBarsRef.current;
    if (prev === bars) return;

    const c = resolvedTheme === "dark" ? CHART_THEME.dark : CHART_THEME.light;
    const volumeSeries = volumeSeriesRef.current;

    if (bars.length === 0) {
      series.setData([]);
      if (volumeSeries) volumeSeries.setData([]);
      prevBarsRef.current = bars;
      return;
    }

    const canIncremental =
      prev !== null &&
      prev.length > 0 &&
      prev[0].time === bars[0].time &&
      (bars.length === prev.length || bars.length === prev.length + 1);

    if (canIncremental) {
      const lastBar = bars[bars.length - 1];
      series.update(mapBar(lastBar, c, dimBefore));
      if (volumeSeries) {
        const volPoint = mapVolume(lastBar, c);
        if (volPoint) volumeSeries.update(volPoint);
        // volume 없는 봉(라이브 병합 append 등) 은 histogram 미갱신 — 이전 상태 유지.
      }
    } else {
      series.setData(bars.map((b) => mapBar(b, c, dimBefore)));
      if (volumeSeries) {
        const volData = bars
          .map((b) => mapVolume(b, c))
          .filter((p): p is VolumePoint => p !== null);
        volumeSeries.setData(volData);
      }
      if (!locked) {
        chartRef.current?.timeScale().fitContent();
      }
    }
    if (locked && chartRef.current) {
      applyLockedRange(chartRef.current, bars, dimBefore);
    }
    prevBarsRef.current = bars;
  }, [bars, locked, dimBefore, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-md"
      style={{ height }}
    />
  );
};
