"use client";

import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockIntraday } from "@/features/stock-intraday/useStockIntraday";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import type { ChartBar, IndexDailySnapshot } from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { resampleIntradayBars } from "@/shared/utils/resampleIntradayBars";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { resampleToWeekly } from "@/shared/utils/resampleToWeekly";
import { parseISO, startOfWeek, format } from "date-fns";
import {
  CandlestickChart,
  LineChart,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "intraday" | "full";
type Granularity = "day" | "week" | "month";
type SeriesKind = "candle" | "line";

type StockChartTabsProps = {
  ticker: string;
  prices: StockPriceSnapshot[]; // DESC from getDailyPrices
};

const VIEW_MODE_BUTTONS: { value: ViewMode; label: string }[] = [
  { value: "intraday", label: "당일" },
  { value: "full", label: "전체" },
];

const GRANULARITY_BUTTONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" },
];

const SERIES_KIND_BUTTONS: { value: SeriesKind; label: string; Icon: LucideIcon }[] = [
  { value: "candle", label: "캔들", Icon: CandlestickChart },
  { value: "line", label: "선", Icon: LineChart },
];

// MA period 상수 (module-level → 리렌더 간 참조 안정, PriceChart config effect 불필요 재실행 방지).
// bars.length < period 는 PriceChart 내부에서 가드 → 짧은 히스토리는 자연 스킵.
// week: 13(≈분기)/26(≈반기). 52(≈1년)는 250영업일≈50주 내 렌더 여유가 부족해 제외.
const DAY_MA_PERIODS: number[] = [5, 20, 60, 120];
const WEEK_MA_PERIODS: number[] = [13, 26];
const MONTH_MA_PERIODS: number[] = [6, 12];

// granularity 진입 시 초기 표시 창 — 대략 최근 1년 기준. 프리셋 버튼은 걷어냈고
// 이 기본값 + 직접입력 + 휠 역반영으로 barCount 를 조절한다.
const GRANULARITY_DEFAULT_BARS: Record<Granularity, number> = {
  day: 250,
  week: 52,
  month: 12,
};

// intraday 분봉 세트. base = 1분(KIS output). N분 = resampleIntradayBars 로 버킷 집계.
// 기본 5분: 1분은 390봉으로 dense, 5분(≈78봉) 이 첫 인상에 적당.
const INTRADAY_INTERVAL_BUTTONS: number[] = [1, 5, 15];
const INTRADAY_INTERVAL_DEFAULT = 5;

// intraday 응답이 아직 도착하지 않았을 때 fallback — module-level 로 참조 안정화해
// intradayResampled useMemo 의 deps 가 매 렌더 바뀌지 않게 한다.
const EMPTY_BARS: ChartBar[] = [];

// DESC → ASC ChartBar[]. volume 은 histogram 오버레이용 (StockPriceSnapshot.volume 그대로).
const stockPricesToBars = (prices: StockPriceSnapshot[]): ChartBar[] =>
  [...prices]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((p) => ({
      time: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));

// P2 종목 병합 로직: 마지막 EOD 봉 time === 당일 date → replace, 아니면 append.
// 오늘 봉 volume 은 라이브 quote 의 acml_vol(누적 거래량) 을 우선 사용.
// EOD 에 오늘 봉이 이미 있는 경우(replace 경로) preservedVolume 을 fallback 으로 유지 —
// 라이브 quote 가 아직 도착하지 않았거나 파싱 실패로 volume 이 결측일 때 안전망.
const mergeLiveDayBar = (
  eod: ChartBar[],
  quote: { open: number; high: number; low: number; price: number; volume: number } | null,
  date: string | undefined
): ChartBar[] => {
  if (!quote || !date) return eod;
  const last = eod[eod.length - 1];
  const preservedVolume = last && last.time === date ? last.volume : undefined;
  const live: ChartBar = {
    time: date,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.price,
    volume: quote.volume ?? preservedVolume,
  };
  if (last && last.time === date) return [...eod.slice(0, -1), live];
  return [...eod, live];
};

// dayBars → 월별 volume 합. resampleToMonthly 결과 date("YYYY-MM-01") 와 "YYYY-MM" 로 조인.
// resampleToMonthly 시그니처가 IndexDailySnapshot(volume 없음) 이라 shim 을 안 뜯고 여기서 얹는다.
const sumVolumeByMonth = (bars: ChartBar[]): Map<string, number> => {
  const acc = new Map<string, number>();
  for (const b of bars) {
    if (b.volume === undefined) continue;
    if (typeof b.time !== "string") continue;
    const ym = b.time.slice(0, 7);
    acc.set(ym, (acc.get(ym) ?? 0) + b.volume);
  }
  return acc;
};

// dayBars → 주별 volume 합. resampleToWeekly 결과 date(월요일 "yyyy-MM-dd") 와 full date 로 조인.
// sumVolumeByMonth 미러 — 키 계산만 다름.
const sumVolumeByWeek = (bars: ChartBar[]): Map<string, number> => {
  const acc = new Map<string, number>();
  for (const b of bars) {
    if (b.volume === undefined) continue;
    if (typeof b.time !== "string") continue;
    const monday = format(startOfWeek(parseISO(b.time), { weekStartsOn: 1 }), "yyyy-MM-dd");
    acc.set(monday, (acc.get(monday) ?? 0) + b.volume);
  }
  return acc;
};

// resampleToMonthly 는 현재 IndexDailySnapshot 시그니처 → ChartBar 로 shim (change/changeRate 는
// 결과에서 소비되지 않음). resampleToMonthly refactor 는 이번 스코프 밖.
const barsToSnapshots = (bars: ChartBar[]): IndexDailySnapshot[] =>
  bars.map((b) => ({
    indexCode: "",
    date: String(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    change: 0,
    changeRate: 0,
  }));

const snapshotsToBars = (snaps: IndexDailySnapshot[]): ChartBar[] =>
  snaps.map((s) => ({
    time: s.date,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
  }));

const EMPTY_STATE_HEIGHT = 300;

export const StockChartTabs = ({ ticker, prices }: StockChartTabsProps) => {
  // 기본 full/day: 폐장/장전엔 종목 intraday 응답이 완전히 비어 첫인상에 빈 상태를 보게 되므로,
  // 사용자가 명시적으로 "당일" 선택했을 때만 intraday 로드/폴링. IndexChart(intraday 기본
  // + silent fallback) 와 정책이 다르지만, 종목 intraday 는 전일 데이터 없이 오늘만 반환하는
  // endpoint 특성 때문에 fallback 이 무의미 — 예측 가능한 full/day 를 진입 기본으로.
  // seriesKind 는 granularity 전환에도 유지 (사용자 선호 지속).
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [intradayInterval, setIntradayInterval] = useState<number>(
    INTRADAY_INTERVAL_DEFAULT,
  );
  const [seriesKind, setSeriesKind] = useState<SeriesKind>("candle");
  // 표시 봉 개수. null = 전체. 입력·프리셋 공용. PriceChart 가 visibleBars 로 소비 (데이터 slice 없음).
  const [barCount, setBarCount] = useState<number | null>(
    GRANULARITY_DEFAULT_BARS.day,
  );
  // input remount 카운터 — 무효 입력 후 defaultValue 로 원복시키기 위한 key nonce.
  // 프리셋 클릭 등 barCount 자체 변경은 barCount 값이 key 에 이미 들어 있어 자동 remount.
  const [inputRevertNonce, setInputRevertNonce] = useState(0);
  const isIntradayView = viewMode === "intraday";

  // granularity 전환 시 표시 창을 해당 기본값으로 재설정 — 주기별로 "봉 개수"의 감각이 다르므로
  // (일 250 ≈ 1년, 주 52 ≈ 1년, 월 12 ≈ 1년) 이전 값 유지가 오히려 혼란.
  useEffect(() => {
    setBarCount(GRANULARITY_DEFAULT_BARS[granularity]);
  }, [granularity]);

  // 헤더 폴링과 동일 queryKey — subscribeOnly 로 캐시만 구독, 네트워크 추가 0.
  const { data: quoteData } = useStockQuote(ticker, { subscribeOnly: true });
  // intraday 뷰 활성 시에만 fetch/polling. 미활성 뷰에서는 백그라운드 트래픽 0.
  const intradayQuery = useStockIntraday(ticker, { enabled: isIntradayView });

  const dayBars = useMemo<ChartBar[]>(() => {
    const eod = stockPricesToBars(prices);
    return mergeLiveDayBar(eod, quoteData?.quote ?? null, quoteData?.date);
  }, [prices, quoteData]);

  const weekBars = useMemo<ChartBar[]>(() => {
    const base = snapshotsToBars(resampleToWeekly(barsToSnapshots(dayBars)));
    const weekVolume = sumVolumeByWeek(dayBars);
    // resampleToWeekly 결과 date 는 월요일 "yyyy-MM-dd" — full date 일치로 조인.
    return base.map((b) => {
      if (typeof b.time !== "string") return b;
      const v = weekVolume.get(b.time);
      return v !== undefined ? { ...b, volume: v } : b;
    });
  }, [dayBars]);

  const monthBars = useMemo<ChartBar[]>(() => {
    const base = snapshotsToBars(resampleToMonthly(barsToSnapshots(dayBars)));
    const monthVolume = sumVolumeByMonth(dayBars);
    return base.map((b) => {
      if (typeof b.time !== "string") return b;
      const v = monthVolume.get(b.time.slice(0, 7));
      return v !== undefined ? { ...b, volume: v } : b;
    });
  }, [dayBars]);

  const intradayBars = intradayQuery.data?.bars ?? EMPTY_BARS;
  const hasIntraday = intradayBars.length > 0;
  // route 가 완전 fetch 실패 시 true. bars 는 항상 [] 이므로 실패는 empty 를 동반.
  const intradayFailed = intradayQuery.data?.failed ?? false;

  // intraday base 는 1분봉 → 선택한 간격으로 N분 리샘플. 1분은 raw 통과.
  const intradayResampled = useMemo<ChartBar[]>(
    () => resampleIntradayBars(intradayBars, intradayInterval),
    [intradayBars, intradayInterval],
  );

  const bars = isIntradayView
    ? intradayResampled
    : granularity === "week"
      ? weekBars
      : granularity === "month"
        ? monthBars
        : dayBars;

  // 실패는 항상 empty(bars:[]) 를 동반하므로 failed 로 분기 우선순위 결정 —
  // 두 분기는 상호 배타(동시 참 불가).
  const showFailedIntraday =
    isIntradayView && !intradayQuery.isLoading && !hasIntraday && intradayFailed;
  const showEmptyIntraday =
    isIntradayView && !intradayQuery.isLoading && !hasIntraday && !intradayFailed;

  // maPeriods: intraday·선차트 는 미표시. full 캔들 뷰만 granularity 별 상수.
  const maPeriods =
    isIntradayView || seriesKind === "line"
      ? undefined
      : granularity === "week"
        ? WEEK_MA_PERIODS
        : granularity === "month"
          ? MONTH_MA_PERIODS
          : DAY_MA_PERIODS;

  // 데이터 길이 기준 MA 필터 — 표시 창(barCount) 이 아니라 실제 로드된 bars 기준.
  // 창이 좁아도 창 밖 데이터로 SMA 계산이 가능하므로 창 크기와 분리.
  const effectiveMaPeriods = useMemo(() => {
    if (!maPeriods) return undefined;
    const filtered = maPeriods.filter((p) => p <= bars.length);
    return filtered.length > 0 ? filtered : undefined;
  }, [maPeriods, bars.length]);

  const applyBarCountFromInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setBarCount(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1) {
      // 무효 입력 → nonce 증가로 remount 하여 defaultValue(=현 barCount) 로 원복.
      setInputRevertNonce((v) => v + 1);
      return;
    }
    setBarCount(Math.min(Math.round(n), bars.length));
  };

  if (prices.length === 0 && !hasIntraday) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">가격 데이터 없음</p>
      </>
    );
  }

  // 선택 상태 색은 차트 섹션(무채색 원칙) 의 예외 — 툴바 강조에 한해 lavender 사용
  // (styleguide 상 차트=lavender 계열). 비선택은 muted, disabled 는 opacity 로 흐림.
  const toolbarButtonCls = (active: boolean, disabled = false) =>
    cn(
      "rounded-sm px-2 py-1 text-xs transition-colors",
      active
        ? "bg-lavender-bg text-lavender-accent font-medium"
        : "text-muted-foreground",
      !disabled && !active && "hover:text-foreground",
      disabled && "opacity-40",
    );

  const groupWrapperCls = "flex gap-0.5 rounded-md border border-subtle bg-elevated p-0.5";

  return (
    <>
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">가격 차트</h2>
          <div className={groupWrapperCls} role="group" aria-label="차트 뷰">
            {VIEW_MODE_BUTTONS.map(({ value, label: btnLabel }) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewMode === value}
                onClick={() => setViewMode(value)}
                className={toolbarButtonCls(viewMode === value)}
              >
                {btnLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <div className={groupWrapperCls} role="group" aria-label="차트 종류">
            {SERIES_KIND_BUTTONS.map(({ value, label: btnLabel, Icon }) => {
              const active = seriesKind === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={btnLabel}
                  aria-pressed={active}
                  onClick={() => setSeriesKind(value)}
                  className={toolbarButtonCls(active)}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {isIntradayView ? (
            <div className={groupWrapperCls} role="group" aria-label="분봉 간격">
              {INTRADAY_INTERVAL_BUTTONS.map((m) => {
                const active = intradayInterval === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setIntradayInterval(m)}
                    className={toolbarButtonCls(active)}
                  >
                    {m}분
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={groupWrapperCls} role="group" aria-label="차트 주기">
              {GRANULARITY_BUTTONS.map(({ value, label: btnLabel }) => {
                const active = granularity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGranularity(value)}
                    className={toolbarButtonCls(active)}
                  >
                    {btnLabel}
                  </button>
                );
              })}
            </div>
          )}
          <input
            key={`bc-${barCount ?? "all"}-${inputRevertNonce}`}
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="표시 봉 개수"
            aria-disabled={isIntradayView}
            disabled={isIntradayView}
            defaultValue={barCount === null ? "" : String(barCount)}
            onBlur={(e) => applyBarCountFromInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className={cn(
              "h-[26px] w-14 rounded-md border border-subtle bg-elevated px-2 text-xs text-foreground",
              "focus:border-lavender-border focus:outline-none",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              isIntradayView && "opacity-40",
            )}
          />
        </div>
      </div>
      {showFailedIntraday ? (
        <div
          className="flex w-full flex-col items-center justify-center gap-4 rounded-md border border-subtle bg-elevated"
          style={{ height: EMPTY_STATE_HEIGHT }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
            <WifiOff
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              실시간 시세를 일시적으로 불러오지 못했어요
            </p>
            <p className="text-xs text-muted-foreground">
              잠시 후 다시 시도해 주세요
            </p>
          </div>
          <button
            type="button"
            onClick={() => intradayQuery.refetch()}
            disabled={intradayQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-subtle disabled:hover:text-muted-foreground"
          >
            <RefreshCw
              className={cn("h-3 w-3", intradayQuery.isFetching && "animate-spin")}
              aria-hidden="true"
            />
            다시 시도
          </button>
        </div>
      ) : showEmptyIntraday ? (
        <div
          className="flex w-full items-center justify-center rounded-md text-sm text-muted-foreground"
          style={{ height: EMPTY_STATE_HEIGHT }}
        >
          당일 인트라데이 데이터 없음
        </div>
      ) : (
        <PriceChart
          bars={bars}
          precision={0}
          timeVisible={isIntradayView}
          locked={isIntradayView}
          showVolume
          showLegend
          maPeriods={effectiveMaPeriods}
          seriesKind={seriesKind}
          visibleBars={isIntradayView ? undefined : barCount}
          onVisibleBarsChange={isIntradayView ? undefined : setBarCount}
        />
      )}
    </>
  );
};
