"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  type BarData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
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
  // 메인 시리즈 종류. "candle" — CandlestickSeries(OHLC). "line" — close 기반 선/영역 시리즈.
  // 기본 "candle" — 기존 호출부(지수·미니차트) 변경 없이 캔들 유지.
  seriesKind?: "candle" | "line";
  // 선차트 기준선 가격. seriesKind==="line" 일 때만 BaselineSeries(위=up/아래=down 2색) 로 전환.
  // 미제공 시 AreaSeries 무채색 fallback. 값 변경은 시리즈 재생성 없이 applyOptions 로 반영.
  baseline?: number;
  // 최근 N봉만 보이도록 시계축 논리 범위를 제어. null/undefined = 전체 표시.
  // 데이터를 자르지 않고 표시 창만 조정 → 툴바 조작 시 계산/네트워크 비용 없이 즉시 반영.
  // locked=true(intraday) 뷰에서는 무시 (applyLockedRange 가 우선).
  visibleBars?: number | null;
  // 사용자 휠/팬으로 표시 창이 바뀌었을 때 새 봉 개수를 알려주는 콜백.
  // 상위 상태(barCount input) 와 양방향 동기화용. locked 뷰에서는 구독 자체를 안 건다.
  // 값이 전체 근사면 null 을 전달 (프리셋의 "전체" 와 대응).
  onVisibleBarsChange?: (n: number | null) => void;
};

const DEFAULT_HEIGHT = 300;
const INTRADAY_BAR_BUFFER_SEC = 600; // 오른쪽 여유 = 10분봉 1개 폭
// EOD 뷰 우측 여백 = 보이는 봉수 × 비율. 픽셀 여백을 봉수와 무관하게 일정 비율로 유지.
// (rightOffset 고정 방식은 60/120/월 등 봉 폭이 크게 바뀔 때 여백 폭이 시각적으로 흔들려 폐기.)
const RIGHT_MARGIN_RATIO = 0.04;

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

// close 기반 line 포인트. seriesKind === "line" 전용. dim/색 오버라이드는 사용하지 않음.
const mapLine = (b: ChartBar): LineData => ({
  time: toTime(b.time),
  value: b.close,
});

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

// legend 거래량 — 단위 없이 천단위 콤마 풀 표기.
const formatLegendVolume = (v: number): string => v.toLocaleString("ko-KR");

// 등락률 %. 부호 포함 소수 2자리. prevClose 없거나 0이면 null.
const formatChangePct = (close: number, prevClose: number | null): string | null => {
  if (prevClose === null || prevClose === 0) return null;
  const pct = ((close - prevClose) / prevClose) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  return `${sign}${pct.toFixed(2)}%`;
};

// legend DOM 갱신. bar=null → 텍스트 비움. 등락색은 CHART_THEME up/down 재사용.
// 숫자 값만 삽입 → XSS 위험 없음.
// candle: 시 고 저 종 [등락률] [거]. 종가색 = 봉 방향(close ≥ open).
// line: 종 [등락률] [거]. 종가색 = 전일 대비(prevClose 기준).
const paintLegend = (
  el: HTMLDivElement | null,
  bar: ChartBar | null,
  prevClose: number | null,
  palette: ChartPalette,
  precision: number,
  kind: "candle" | "line",
) => {
  if (!el) return;
  if (!bar) {
    el.innerHTML = "";
    return;
  }
  const labelCls = "text-muted-foreground";
  let closeColor: string | undefined;
  if (kind === "candle") {
    closeColor = bar.close >= bar.open ? palette.up : palette.down;
  } else if (prevClose !== null) {
    closeColor =
      bar.close > prevClose
        ? palette.up
        : bar.close < prevClose
          ? palette.down
          : undefined;
  }
  const parts: string[] = [];
  if (kind === "candle") {
    parts.push(
      `<span class="${labelCls}">시</span> ${formatOhlc(bar.open, precision)}`,
      `<span class="${labelCls}">고</span> ${formatOhlc(bar.high, precision)}`,
      `<span class="${labelCls}">저</span> ${formatOhlc(bar.low, precision)}`,
    );
  }
  const closeSpan = closeColor
    ? `<span style="color:${closeColor}">${formatOhlc(bar.close, precision)}</span>`
    : formatOhlc(bar.close, precision);
  parts.push(`<span class="${labelCls}">종</span> ${closeSpan}`);
  const pct = formatChangePct(bar.close, prevClose);
  if (pct !== null) {
    // 등락률 색은 부호 기준 (봉 방향과 다를 수 있음: 갭업 후 종가 하락 등).
    const pctColor = pct.startsWith("+")
      ? palette.up
      : pct.startsWith("-")
        ? palette.down
        : undefined;
    parts.push(
      pctColor
        ? `<span style="color:${pctColor}">${pct}</span>`
        : `<span class="${labelCls}">${pct}</span>`,
    );
  }
  if (bar.volume !== undefined) {
    parts.push(
      `<span class="${labelCls}">거</span> ${formatLegendVolume(bar.volume)}`,
    );
  }
  el.innerHTML = parts.join('<span class="inline-block w-3"></span>');
};

// MA 범례 — 좌측 "이동평균" 라벨(muted) 뒤에 period 숫자만 표시(라인색).
// 실제로 그려진 period 만 표시(가드로 스킵된 period 는 범례에도 없음).
const paintMaLegend = (
  el: HTMLDivElement | null,
  drawn: { period: number; colorIdx: number }[],
  palette: ChartPalette,
) => {
  if (!el) return;
  if (drawn.length === 0) {
    el.innerHTML = "";
    return;
  }
  const nums = drawn
    .map(
      ({ period, colorIdx }) =>
        `<span style="color:${palette.ma[colorIdx % palette.ma.length]}">${period}</span>`,
    )
    .join('<span class="mx-1.5 opacity-30">·</span>');
  el.innerHTML = `<span class="text-muted-foreground mr-1.5">이동평균</span>${nums}`;
};

// Time → 비교/포맷용 문자열 키.
const timeToKey = (t: string | number | { year: number; month: number; day: number }): string => {
  if (typeof t === "string") return t;
  if (typeof t === "number") return String(t);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
};

// TickMarkType 별 한국식 연-월-일 순 라벨. day/month 전용 (timeVisible 시 미적용).
const chartTickFormatter = (time: Time, tickMarkType: TickMarkType): string => {
  let y: number, m: number, d: number;
  if (typeof time === "string") {
    const [ys, ms, ds] = time.split("-").map(Number);
    y = ys;
    m = ms;
    d = ds;
  } else if (typeof time === "number") {
    const dt = new Date(time * 1000);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  } else {
    y = time.year;
    m = time.month;
    d = time.day;
  }
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  switch (tickMarkType) {
    case TickMarkType.Year:
      // 2자리(예: 2026 → 26). 축 밀도 절감. crosshair 툴팁은 localization.dateFormat 그대로.
      return String(y % 100).padStart(2, "0");
    case TickMarkType.Month:
      return mm;
    case TickMarkType.DayOfMonth:
      return `${mm}-${dd}`;
    default:
      return `${y}-${mm}-${dd}`;
  }
};

// locked 뷰의 가시 범위. from = (전일 마지막 dim 봉 time) − LOOKBACK, to = 최신 봉 + 소폭 추적.
// anchor 가 last 와 같으면(= 오늘 데이터 없이 마지막 세션 봉만 있음) 좁은 70분 창 대신
// 전체 봉 범위로 폴백해 주말/장전에도 마지막 세션 전체가 보이게 한다.
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

  // anchor 가 last 와 동일하면 "전일 tail + 오늘" 컨텍스트가 성립하지 않으므로
  // 첫 봉을 시작으로 삼는다(= 전체 세션 표시).
  const hasIntradayContext = anchor !== null && anchor !== last;
  const first = bars[0].time;
  const from = hasIntradayContext
    ? (anchor as number) - INTRADAY_PREV_LOOKBACK_SEC
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
  seriesKind = "candle",
  baseline,
  visibleBars,
  onVisibleBarsChange,
}: PriceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // seriesKind 변경 시 config effect 가 재실행되어 재생성하므로 union 참조로 유지.
  const seriesRef = useRef<
    ISeriesApi<"Candlestick" | "Area" | "Baseline"> | null
  >(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // period 별 라인 시리즈. bars.length < period 로 생성 스킵된 항목은 배열에 없음.
  // colorIdx = 원본 maPeriods 인덱스 → 라인과 MA 범례 색을 동일 팔레트 인덱스로 매칭.
  const maSeriesRef = useRef<
    { period: number; colorIdx: number; series: ISeriesApi<"Line"> }[]
  >([]);
  const prevBarsRef = useRef<ChartBar[] | null>(null);
  const barsRef = useRef<ChartBar[]>(bars);
  // visibleBars 최신값 — 데이터 effect 등 다른 effect 에서 참조하되 자기 deps 에 넣기 싫을 때.
  const visibleBarsRef = useRef<number | null | undefined>(visibleBars);
  // 현재 살아있는 차트에 대한 visible-range 적용 함수. config effect 가 chart 재생성마다 새로 셋업.
  // 다른 effect 에서 호출할 수 있도록 ref 로 노출.
  const applyRangeRef = useRef<((n: number | null | undefined) => void) | null>(
    null,
  );
  // programmatic setVisibleLogicalRange 로 인한 subscribe 콜백을 무시하기 위한 재진입 가드.
  // rAF 이후 해제 — 라이트웨이트차트가 range 변경을 큐잉하므로 동일 tick 내엔 유지.
  const applyingRangeRef = useRef(false);
  // 마지막으로 상위에 보고한 봉 개수(중복 콜백 억제 + wheel-originated 값 재적용 방지).
  const lastReportedRef = useRef<number | null | undefined>(undefined);
  // 콜백 최신 참조 — 구독 재설정 없이도 갈아끼울 수 있도록 ref 로.
  const onVisibleBarsChangeRef = useRef(onVisibleBarsChange);
  // 휠 연사 시 setState 폭주 방지용 debounce 타이머.
  const reportTimerRef = useRef<number | null>(null);
  // 팬 clamp 에서 참조 — subscribe 콜백이 config effect 재구독 사이의 잔여 이벤트를 처리할 수도 있어
  // 최신값이 필요. 구독 재설정 자체가 있지만 방어적으로 ref 로 안정화.
  const lockedRef = useRef(locked);
  const interactiveRef = useRef(interactive);
  // legend DOM refs + hover 여부 (bars 갱신 시 미호버면 최신봉으로 refresh).
  const legendRef = useRef<HTMLDivElement>(null);
  const maLegendRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef<boolean>(false);

  // period 배열 참조 안정화 (부모가 새 배열을 만들어도 값 동일하면 재실행 방지).
  const maPeriodsKey = maPeriods?.join(",") ?? "";

  // 정의 여부만 config effect 재생성 트리거 (AreaSeries ↔ BaselineSeries 스왑).
  // 값 자체 변경은 아래 baseline effect 가 applyOptions 로 흡수해 시리즈 재생성 회피.
  const hasBaseline = seriesKind === "line" && baseline !== undefined;

  const { resolvedTheme } = useTheme();

  // config effect 가 재실행될 때 최신 bars 로 초기화할 수 있도록 렌더 후 동기화.
  // 선언 순서상 config/data effect 보다 먼저 실행된다.
  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

  // visibleBars 는 데이터 effect / 비-incremental 재설정 경로에서도 최신값을 참조해야 하므로 ref 로.
  useEffect(() => {
    visibleBarsRef.current = visibleBars;
  }, [visibleBars]);

  useEffect(() => {
    onVisibleBarsChangeRef.current = onVisibleBarsChange;
  }, [onVisibleBarsChange]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

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
      // 크로스헤어 툴팁 날짜: 연-월-일. 인트라데이는 시간 표기가 별도로 붙어 그대로 유지.
      localization: { locale: "ko-KR", dateFormat: "yyyy-MM-dd" },
      timeScale: {
        borderColor: c.border,
        timeVisible,
        secondsVisible: false,
        // 여백은 setVisibleLogicalRange 의 to 값이 전담 (locked=applyLockedRange,
        // EOD=applyVisibleRange). rightOffset 은 auto-fit/shift 경로만 관여하므로 0.
        rightOffset: 0,
        // 첫 봉보다 더 왼쪽으로 팬 금지 — 네이티브 옵션이 whitespace 를 그대로 처리해준다.
        // 우측 경계는 setVisibleLogicalRange 의 여백(RIGHT_MARGIN_RATIO) 을 지켜야 하므로
        // fixRightEdge 대신 subscribe 콜백에서 custom clamp (아래 참조).
        fixLeftEdge: true,
        // 축 tick 도 한국식 연-월-일 순. intraday(timeVisible) 는 기본 시간 포맷 유지.
        ...(!timeVisible ? { tickMarkFormatter: chartTickFormatter } : {}),
      },
      rightPriceScale: { borderColor: c.border },
      handleScroll: scrollScale,
      handleScale: scrollScale,
    });

    // candle=OHLC / line+baseline=BaselineSeries 2색 / line only=AreaSeries 무채색 fallback.
    const priceFormat = {
      type: "price" as const,
      precision,
      minMove: 10 ** -precision,
    };
    let series: ISeriesApi<"Candlestick" | "Area" | "Baseline">;
    if (hasBaseline) {
      series = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: baseline as number },
        topLineColor: c.up,
        bottomLineColor: c.down,
        topFillColor1: c.baseline.topFill1,
        topFillColor2: c.baseline.topFill2,
        bottomFillColor1: c.baseline.bottomFill1,
        bottomFillColor2: c.baseline.bottomFill2,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat,
      });
    } else if (seriesKind === "line") {
      series = chart.addSeries(AreaSeries, {
        lineColor: c.neutralLine,
        topColor: c.neutralTopFill,
        bottomColor: c.neutralBottomFill,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat,
      });
    } else {
      series = chart.addSeries(CandlestickSeries, {
        upColor: c.up,
        downColor: c.down,
        borderVisible: false,
        wickUpColor: c.up,
        wickDownColor: c.down,
        priceFormat,
      });
    }

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
    // 팔레트 색은 원본 maPeriods 인덱스로 매핑 (범례 색과 일치).
    const initial = barsRef.current;
    const maSeriesList: {
      period: number;
      colorIdx: number;
      series: ISeriesApi<"Line">;
    }[] = [];
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
        maSeriesList.push({ period, colorIdx: idx, series: lineSeries });
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRef.current = maSeriesList;

    // 표시 창 적용 — 데이터 slice 대신 시계축 논리 범위로 최근 N봉만 보이게.
    // n=null/undefined → 전체 표시. 우측 여백은 보이는 봉수 × RIGHT_MARGIN_RATIO 로 비례해
    // day 250봉/week 52봉/month 12봉 어디서든 화면폭 대비 같은 비율의 빈 공간이 남는다.
    // applyingRangeRef 로 감싸 subscribe 콜백이 programmatic 변경을 되받지 않게 한다.
    const applyVisibleRange = (n: number | null | undefined) => {
      const len = barsRef.current.length;
      if (len === 0) return;
      const visibleCount = n == null ? len : Math.min(n, len);
      const margin = visibleCount * RIGHT_MARGIN_RATIO;
      const from = n == null ? 0 : Math.max(0, len - n);
      const to = len - 1 + margin;
      applyingRangeRef.current = true;
      chart.timeScale().setVisibleLogicalRange({ from, to });
      requestAnimationFrame(() => {
        applyingRangeRef.current = false;
      });
    };
    applyRangeRef.current = applyVisibleRange;

    // 휠/팬으로 표시 창이 바뀌면 봉 개수를 역산해 상위에 보고 (locked 뷰는 구독 안 함).
    // 매 이벤트마다 setState 하면 폭주하므로 80ms debounce. 값이 이전 보고와 같으면 skip.
    // 미래쪽 팬 clamp 는 여기서 즉시 실행 — barCount 역반영보다 먼저 뷰를 되돌린다.
    let logicalRangeHandler: ((range: LogicalRange | null) => void) | null =
      null;
    if (!locked) {
      logicalRangeHandler = (incoming) => {
        if (applyingRangeRef.current || !incoming) return;
        const len = barsRef.current.length;
        if (len === 0) return;

        // 미래쪽 clamp — RIGHT_MARGIN_RATIO 만큼의 우측 여백은 허용, 그 이상은 되돌린다.
        // tolerance 0.5 (봉 절반) 로 rubber-band/부동소수 오차 흡수해 잦은 재설정 방지.
        // LogicalRange 는 branded 라 raw number 로 풀어서 다룬다.
        let from: number = incoming.from;
        let to: number = incoming.to;
        if (interactiveRef.current && !lockedRef.current) {
          const width = to - from;
          const maxTo = len - 1 + width * RIGHT_MARGIN_RATIO;
          if (to > maxTo + 0.5) {
            to = maxTo;
            from = maxTo - width;
            applyingRangeRef.current = true;
            chartRef.current
              ?.timeScale()
              .setVisibleLogicalRange({ from, to });
            requestAnimationFrame(() => {
              applyingRangeRef.current = false;
            });
          }
        }

        const right = Math.min(to, len - 1);
        const left = Math.max(from, 0);
        const visible = Math.round(right - left) + 1;
        const clamped = Math.max(1, Math.min(visible, len));
        const next = clamped >= len ? null : clamped;
        if (reportTimerRef.current !== null) {
          window.clearTimeout(reportTimerRef.current);
        }
        reportTimerRef.current = window.setTimeout(() => {
          reportTimerRef.current = null;
          if (next !== lastReportedRef.current) {
            lastReportedRef.current = next;
            onVisibleBarsChangeRef.current?.(next);
          }
        }, 80);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);
    }

    if (initial.length > 0) {
      if (seriesKind === "line") {
        (series as ISeriesApi<"Area" | "Baseline">).setData(initial.map(mapLine));
      } else {
        (series as ISeriesApi<"Candlestick">).setData(
          initial.map((b) => mapBar(b, c, dimBefore)),
        );
      }
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
        applyVisibleRange(visibleBarsRef.current);
      }
    }
    prevBarsRef.current = initial;

    // Legend: 초기 상태는 미호버(최신 봉). crosshair 콜백에서 hover 상태에 따라 갱신.
    // ref 로 innerHTML 직접 갱신 → setState 리렌더 없음.
    let crosshairHandler: ((param: MouseEventParams) => void) | null = null;
    if (showLegend) {
      const latestPrev = initial.length >= 2 ? initial[initial.length - 2].close : null;
      const latest = initial.length > 0 ? initial[initial.length - 1] : null;
      paintLegend(legendRef.current, latest, latestPrev, c, precision, seriesKind);
      // MA 범례는 실제 그려진 series 목록에서 도출 → config effect 안에서 1회 렌더.
      paintMaLegend(maLegendRef.current, maSeriesList, c);

      // 미호버 fallback (최신봉 + 그 직전봉 close) — 콜백 3곳에서 재사용.
      const paintLatest = () => {
        const cur = barsRef.current;
        const last = cur.length > 0 ? cur[cur.length - 1] : null;
        const prev = cur.length >= 2 ? cur[cur.length - 2].close : null;
        paintLegend(legendRef.current, last, prev, c, precision, seriesKind);
      };

      crosshairHandler = (param) => {
        const hovering = !!(param.point && param.time);
        isHoveringRef.current = hovering;
        if (!hovering) {
          paintLatest();
          return;
        }
        if (seriesKind === "line") {
          // line: seriesData.get → LineData({time,value}). OHLC/volume 은 barsRef 매칭으로 보완.
          const lineData = param.seriesData.get(series) as LineData | undefined;
          if (!lineData) {
            paintLatest();
            return;
          }
          const key = timeToKey(lineData.time);
          const cur = barsRef.current;
          let matched: ChartBar | null = null;
          let prevClose: number | null = null;
          for (let i = 0; i < cur.length; i++) {
            if (timeToKey(cur[i].time) === key) {
              matched = cur[i];
              prevClose = i > 0 ? cur[i - 1].close : null;
              break;
            }
          }
          if (!matched) {
            paintLatest();
            return;
          }
          paintLegend(legendRef.current, matched, prevClose, c, precision, "line");
          return;
        }
        // seriesData.get(candleSeries) → BarData(OHLC). volume series 있으면 값 join.
        const candleData = param.seriesData.get(series) as BarData | undefined;
        if (!candleData) {
          paintLatest();
          return;
        }
        const volData = volumeSeries
          ? (param.seriesData.get(volumeSeries) as HistogramData | undefined)
          : undefined;
        // barsRef 에서 time 일치 봉의 인덱스 → 직전봉 close.
        const key = timeToKey(candleData.time);
        const cur = barsRef.current;
        let prevClose: number | null = null;
        for (let i = 0; i < cur.length; i++) {
          if (timeToKey(cur[i].time) === key) {
            prevClose = i > 0 ? cur[i - 1].close : null;
            break;
          }
        }
        const bar: ChartBar = {
          time: candleData.time as string | number,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value,
        };
        paintLegend(legendRef.current, bar, prevClose, c, precision, "candle");
      };
      chart.subscribeCrosshairMove(crosshairHandler);
    }

    return () => {
      if (crosshairHandler) chart.unsubscribeCrosshairMove(crosshairHandler);
      if (logicalRangeHandler) {
        chart
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      }
      if (reportTimerRef.current !== null) {
        window.clearTimeout(reportTimerRef.current);
        reportTimerRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRef.current = [];
      prevBarsRef.current = null;
      isHoveringRef.current = false;
      applyRangeRef.current = null;
    };
    // maPeriodsKey 로 배열 값 변화를 감지 (참조 대신 값 비교).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision, timeVisible, interactive, resolvedTheme, locked, dimBefore, showVolume, maPeriodsKey, showLegend, seriesKind, hasBaseline]);

  // baseline 값만 바뀌면 baseValue 만 갱신 — 시리즈 재생성 회피. Baseline 시리즈가 아니면 no-op.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (baseline === undefined || seriesKind !== "line") return;
    (series as ISeriesApi<"Baseline">).applyOptions({
      baseValue: { type: "price", price: baseline },
    });
  }, [baseline, seriesKind]);

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
      if (seriesKind === "line") {
        (series as ISeriesApi<"Area" | "Baseline">).setData([]);
      } else {
        (series as ISeriesApi<"Candlestick">).setData([]);
      }
      if (volumeSeries) volumeSeries.setData([]);
      for (const { series: lineSeries } of maSeriesList) lineSeries.setData([]);
      prevBarsRef.current = bars;
      return;
    }

    // 첫 봉 time 만으로 dataset 동일성을 판정하면 지수 전환(KOSPI↔KOSDAQ↔KOSPI200)
    // 처럼 시작일·길이가 우연히 겹치는 dataset 스왑에서 마지막 봉만 갱신되는 버그가 난다.
    // 첫 봉은 가장 오래된 확정 이력이라 라이브 tick/intraday append 어느 경로에서도
    // OHLC 가 바뀌지 않으므로 tiebreak 로 사용해도 안전.
    const canIncremental =
      prev !== null &&
      prev.length > 0 &&
      prev[0].time === bars[0].time &&
      prev[0].open === bars[0].open &&
      prev[0].high === bars[0].high &&
      prev[0].low === bars[0].low &&
      prev[0].close === bars[0].close &&
      (bars.length === prev.length || bars.length === prev.length + 1);

    if (canIncremental) {
      const lastBar = bars[bars.length - 1];
      if (seriesKind === "line") {
        (series as ISeriesApi<"Area" | "Baseline">).update(mapLine(lastBar));
      } else {
        (series as ISeriesApi<"Candlestick">).update(mapBar(lastBar, c, dimBefore));
      }
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
      if (seriesKind === "line") {
        (series as ISeriesApi<"Area" | "Baseline">).setData(bars.map(mapLine));
      } else {
        (series as ISeriesApi<"Candlestick">).setData(
          bars.map((b) => mapBar(b, c, dimBefore)),
        );
      }
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
        // 툴바 조작(granularity/tab 등) 으로 데이터셋이 통째 갈릴 때 사용자가 지정한 표시 창을
        // 그대로 재적용. fitContent 로 매번 fit 하면 barCount 프리셋/휠 조작이 무시된다.
        applyRangeRef.current?.(visibleBarsRef.current);
      }
    }
    if (locked && chartRef.current) {
      applyLockedRange(chartRef.current, bars, dimBefore);
    }
    prevBarsRef.current = bars;

    // Legend: 사용자가 crosshair 로 특정 봉을 보고 있을 땐 그대로 두고,
    // 미호버 상태에서만 최신 봉으로 갱신 (라이브 tick 반영).
    if (showLegend && !isHoveringRef.current) {
      const last = bars.length > 0 ? bars[bars.length - 1] : null;
      const prev = bars.length >= 2 ? bars[bars.length - 2].close : null;
      paintLegend(legendRef.current, last, prev, c, precision, seriesKind);
    }
  }, [bars, locked, dimBefore, resolvedTheme, showLegend, precision, seriesKind]);

  // visibleBars prop 변경 → 표시 창 재적용. 데이터 배열은 그대로, 시계축 논리 범위만 이동.
  // config effect 재실행/데이터 effect 와 별개로 툴바 조작(프리셋·입력) 반영 경로.
  // 휠에서 역산돼 올라간 값(prop === lastReportedRef.current) 은 이미 그 창을 보고 있으니
  // 재적용하면 반올림 오차로 미세하게 튐 → skip.
  // locked 뷰(당일)에서는 applyLockedRange 가 시간축 범위를 잡으므로 논리 범위 재적용을
  // 스킵한다 — 이 가드가 없으면 EOD→당일 전환 시 visibleBars(N→undefined) 이 여기서
  // 전체 논리 범위로 override 해 applyLockedRange 결과를 덮어썼다.
  useEffect(() => {
    if (lockedRef.current) return;
    if (visibleBars === lastReportedRef.current) return;
    applyRangeRef.current?.(visibleBars);
  }, [visibleBars]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-default"
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {showLegend && (
        <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-col gap-0.5">
          <div ref={legendRef} className="text-xs tabular-nums" />
          <div ref={maLegendRef} className="text-[11px] font-medium" />
        </div>
      )}
    </div>
  );
};
