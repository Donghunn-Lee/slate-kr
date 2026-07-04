"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type BarData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
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
  // SMA 오버레이 period 목록. 컨테이너에서 module-level 상수 등 안정 참조로 주입.
  // bars.length < period 인 항목은 자동 스킵. 팔레트는 index 로 매핑(4색 modulo 순환).
  maPeriods?: number[];
  // 좌상단 OHLC(+Vol) legend. crosshair 이동 시 해당 봉 값, 미호버 시 최신 봉 값으로 갱신.
  // ref 로 DOM 직접 갱신 → crosshair 콜백에서 setState 리렌더 없음.
  showLegend?: boolean;
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

// close 기반 SMA. index i 에서 [i-p+1, i] 평균. i < p-1 자리는 점 없음.
// bars.length < period 면 빈 배열 반환 (호출 측에서 series 자체 생성 스킵).
type LinePoint = { time: Time; value: number };
const computeSma = (bars: ChartBar[], period: number): LinePoint[] => {
  if (bars.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) {
      out.push({ time: toTime(bars[i].time), value: sum / period });
    }
  }
  return out;
};

// 마지막 봉만 갱신된 경우, 마지막 SMA 포인트 1개만 재계산 → series.update() 대상.
// bars.length < period 면 null (아직 유효한 SMA 점이 없음).
const computeSmaLast = (bars: ChartBar[], period: number): LinePoint | null => {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
  return { time: toTime(bars[bars.length - 1].time), value: sum / period };
};

// legend 값 포맷. precision 은 종목 0 / 지수 2 를 그대로 사용해 축약 없이 로케일 표기.
const formatOhlc = (v: number, precision: number): string =>
  v.toLocaleString("ko-KR", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

// legend 거래량 축약 (formatVolume 은 "주" 접미 → legend 에는 부적합).
const formatLegendVolume = (v: number): string => {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4)}만`;
  return v.toLocaleString("ko-KR");
};

// legend DOM 갱신. bar=null → 텍스트 비움. 등락색은 CHART_THEME up/down 재사용.
// 숫자 값만 삽입 → XSS 위험 없음.
const paintLegend = (
  el: HTMLDivElement | null,
  bar: ChartBar | null,
  palette: ChartPalette,
  precision: number,
) => {
  if (!el) return;
  if (!bar) {
    el.innerHTML = "";
    return;
  }
  const upDown = bar.close >= bar.open ? palette.up : palette.down;
  const labelCls = "text-muted-foreground";
  const parts = [
    `<span class="${labelCls}">O</span> ${formatOhlc(bar.open, precision)}`,
    `<span class="${labelCls}">H</span> ${formatOhlc(bar.high, precision)}`,
    `<span class="${labelCls}">L</span> ${formatOhlc(bar.low, precision)}`,
    `<span class="${labelCls}">C</span> <span style="color:${upDown}">${formatOhlc(bar.close, precision)}</span>`,
  ];
  if (bar.volume !== undefined) {
    parts.push(
      `<span class="${labelCls}">Vol</span> ${formatLegendVolume(bar.volume)}`,
    );
  }
  el.innerHTML = parts.join('<span class="mx-2 opacity-30">·</span>');
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
  maPeriods,
  showLegend = false,
}: PriceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // period 별 라인 시리즈. bars.length < period 로 생성 스킵된 항목은 배열에 없음.
  const maSeriesRef = useRef<{ period: number; series: ISeriesApi<"Line"> }[]>(
    [],
  );
  const prevBarsRef = useRef<ChartBar[] | null>(null);
  const barsRef = useRef<ChartBar[]>(bars);
  // legend DOM ref + hover 여부 (bars 갱신 시 미호버면 최신봉으로 refresh).
  const legendRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef<boolean>(false);

  // period 배열 참조 안정화 (부모가 새 배열을 만들어도 값 동일하면 재실행 방지).
  const maPeriodsKey = maPeriods?.join(",") ?? "";

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

    // MA line series: period 별로 생성. bars 부족한 period 는 series 자체 스킵.
    // 팔레트 색은 period index 로 매핑, 초과 시 modulo 순환.
    const initial = barsRef.current;
    const maSeriesList: { period: number; series: ISeriesApi<"Line"> }[] = [];
    if (maPeriods && maPeriods.length > 0) {
      maPeriods.forEach((period, idx) => {
        if (initial.length < period) return;
        const lineSeries = chart.addSeries(LineSeries, {
          color: c.ma[idx % c.ma.length],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        maSeriesList.push({ period, series: lineSeries });
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRef.current = maSeriesList;

    if (initial.length > 0) {
      series.setData(initial.map((b) => mapBar(b, c, dimBefore)));
      if (volumeSeries) {
        const volData = initial
          .map((b) => mapVolume(b, c))
          .filter((p): p is VolumePoint => p !== null);
        volumeSeries.setData(volData);
      }
      for (const { period, series: lineSeries } of maSeriesList) {
        lineSeries.setData(computeSma(initial, period));
      }
      if (locked) {
        applyLockedRange(chart, initial, dimBefore);
      } else {
        chart.timeScale().fitContent();
      }
    }
    prevBarsRef.current = initial;

    // Legend: 초기 상태는 미호버(최신 봉). crosshair 콜백에서 hover 상태에 따라 갱신.
    // ref 로 innerHTML 직접 갱신 → setState 리렌더 없음.
    let crosshairHandler: ((param: MouseEventParams) => void) | null = null;
    if (showLegend) {
      const latest = initial.length > 0 ? initial[initial.length - 1] : null;
      paintLegend(legendRef.current, latest, c, precision);

      crosshairHandler = (param) => {
        const hovering = !!(param.point && param.time);
        isHoveringRef.current = hovering;
        if (!hovering) {
          const cur = barsRef.current;
          paintLegend(
            legendRef.current,
            cur.length > 0 ? cur[cur.length - 1] : null,
            c,
            precision,
          );
          return;
        }
        // seriesData.get(candleSeries) → BarData(OHLC). volume series 있으면 값 join.
        const candleData = param.seriesData.get(series) as BarData | undefined;
        if (!candleData) {
          const cur = barsRef.current;
          paintLegend(
            legendRef.current,
            cur.length > 0 ? cur[cur.length - 1] : null,
            c,
            precision,
          );
          return;
        }
        const volData = volumeSeries
          ? (param.seriesData.get(volumeSeries) as HistogramData | undefined)
          : undefined;
        const bar: ChartBar = {
          time: candleData.time as string | number,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value,
        };
        paintLegend(legendRef.current, bar, c, precision);
      };
      chart.subscribeCrosshairMove(crosshairHandler);
    }

    return () => {
      if (crosshairHandler) chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRef.current = [];
      prevBarsRef.current = null;
      isHoveringRef.current = false;
    };
    // maPeriodsKey 로 배열 값 변화를 감지 (참조 대신 값 비교).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision, timeVisible, interactive, resolvedTheme, locked, dimBefore, showVolume, maPeriodsKey, showLegend]);

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
    const maSeriesList = maSeriesRef.current;

    if (bars.length === 0) {
      series.setData([]);
      if (volumeSeries) volumeSeries.setData([]);
      for (const { series: lineSeries } of maSeriesList) lineSeries.setData([]);
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
      // MA 는 마지막 SMA 포인트 1개만 재계산. bars 가 append 되어 방금 유효창에 진입했으면
      // 첫 유효 포인트 하나가 그려짐 (line series 시작).
      for (const { period, series: lineSeries } of maSeriesList) {
        const point = computeSmaLast(bars, period);
        if (point) lineSeries.update(point);
      }
    } else {
      series.setData(bars.map((b) => mapBar(b, c, dimBefore)));
      if (volumeSeries) {
        const volData = bars
          .map((b) => mapVolume(b, c))
          .filter((p): p is VolumePoint => p !== null);
        volumeSeries.setData(volData);
      }
      for (const { period, series: lineSeries } of maSeriesList) {
        lineSeries.setData(computeSma(bars, period));
      }
      if (!locked) {
        chartRef.current?.timeScale().fitContent();
      }
    }
    if (locked && chartRef.current) {
      applyLockedRange(chartRef.current, bars, dimBefore);
    }
    prevBarsRef.current = bars;

    // Legend: 사용자가 crosshair 로 특정 봉을 보고 있을 땐 그대로 두고,
    // 미호버 상태에서만 최신 봉으로 갱신 (라이브 tick 반영).
    if (showLegend && !isHoveringRef.current) {
      paintLegend(
        legendRef.current,
        bars.length > 0 ? bars[bars.length - 1] : null,
        c,
        precision,
      );
    }
  }, [bars, locked, dimBefore, resolvedTheme, showLegend, precision]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md"
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {showLegend && (
        <div
          ref={legendRef}
          className="pointer-events-none absolute left-3 top-2 z-10 text-xs tabular-nums"
        />
      )}
    </div>
  );
};
