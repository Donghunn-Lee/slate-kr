"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
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

const mapBar = (b: ChartBar) => ({
  time: toTime(b.time),
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
});

export const PriceChart = ({
  bars,
  precision,
  timeVisible = false,
  height = DEFAULT_HEIGHT,
  interactive = true,
}: PriceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const prevBarsRef = useRef<ChartBar[] | null>(null);
  const barsRef = useRef<ChartBar[]>(bars);

  const { resolvedTheme } = useTheme();

  // config effect 가 재실행될 때 최신 bars 로 초기화할 수 있도록 렌더 후 동기화.
  // 선언 순서상 config/data effect 보다 먼저 등록되므로, 같은 커밋에서 먼저 실행된다.
  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

  // 차트/시리즈는 config(테마·precision·timeVisible·interactive) 변경 시에만 재생성.
  // bars-only 갱신은 아래 데이터 effect가 처리해 사용자 줌 상태를 유지한다.
  useEffect(() => {
    if (!containerRef.current) return;

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

    chartRef.current = chart;
    seriesRef.current = series;

    const initial = barsRef.current;
    if (initial.length > 0) {
      series.setData(initial.map(mapBar));
      chart.timeScale().fitContent();
    }
    prevBarsRef.current = initial;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      prevBarsRef.current = null;
    };
  }, [precision, timeVisible, interactive, resolvedTheme]);

  // 데이터 갱신. 첫 봉 time 동일 + length 동일/+1 이면 series.update 로 줌 유지,
  // 그 외(탭 전환 등 데이터셋 자체 변경)는 setData + fitContent.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const prev = prevBarsRef.current;
    if (prev === bars) return; // 재생성 직후 초기화와 중복 스킵

    if (bars.length === 0) {
      series.setData([]);
      prevBarsRef.current = bars;
      return;
    }

    const canIncremental =
      prev !== null &&
      prev.length > 0 &&
      prev[0].time === bars[0].time &&
      (bars.length === prev.length || bars.length === prev.length + 1);

    if (canIncremental) {
      series.update(mapBar(bars[bars.length - 1]));
    } else {
      series.setData(bars.map(mapBar));
      chartRef.current?.timeScale().fitContent();
    }
    prevBarsRef.current = bars;
  }, [bars]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-md"
      style={{ height }}
    />
  );
};
