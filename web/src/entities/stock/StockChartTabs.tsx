"use client";

import { useMemo, useState } from "react";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockIntraday } from "@/features/stock-intraday/useStockIntraday";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import type { ChartBar, IndexDailySnapshot } from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { resampleToWeekly } from "@/shared/utils/resampleToWeekly";
import { parseISO, startOfWeek, format } from "date-fns";
import { CandlestickChart, LineChart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "intraday" | "full";
type Granularity = "day" | "week" | "month";
type SeriesKind = "candle" | "line";

type StockChartTabsProps = {
  ticker: string;
  prices: StockPriceSnapshot[]; // DESC from getDailyPrices
  label?: string;
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

// 봉개수 프리셋 (granularity 별). "전체" = null 은 UI 에서 별도 처리.
const BAR_COUNT_PRESETS: Record<Granularity, number[]> = {
  day: [60, 120],
  week: [26, 52],
  month: [12, 24],
};

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

export const StockChartTabs = ({ ticker, prices, label }: StockChartTabsProps) => {
  // 기본 full/day: 폐장/장전엔 종목 intraday 응답이 완전히 비어 첫인상에 빈 상태를 보게 되므로,
  // 사용자가 명시적으로 "당일" 선택했을 때만 intraday 로드/폴링. IndexChart(intraday 기본
  // + silent fallback) 와 정책이 다르지만, 종목 intraday 는 전일 데이터 없이 오늘만 반환하는
  // endpoint 특성 때문에 fallback 이 무의미 — 예측 가능한 full/day 를 진입 기본으로.
  // seriesKind 는 granularity 전환에도 유지 (사용자 선호 지속).
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [seriesKind, setSeriesKind] = useState<SeriesKind>("candle");
  // 표시 봉 개수. null = 전체. 입력·프리셋 공용. slice(-n) 은 n>length 시 자동 클램프.
  const [barCount, setBarCount] = useState<number | null>(null);
  // input remount 카운터 — 무효 입력 후 defaultValue 로 원복시키기 위한 key nonce.
  // 프리셋 클릭 등 barCount 자체 변경은 barCount 값이 key 에 이미 들어 있어 자동 remount.
  const [inputRevertNonce, setInputRevertNonce] = useState(0);
  const isIntradayView = viewMode === "intraday";

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

  const intradayBars = intradayQuery.data?.bars ?? [];
  const hasIntraday = intradayBars.length > 0;

  const bars = isIntradayView
    ? intradayBars
    : granularity === "week"
      ? weekBars
      : granularity === "month"
        ? monthBars
        : dayBars;

  // full 뷰만 봉개수 적용. intraday 는 세션 데이터라 slice 무의미.
  // slice(-n) 은 n > length 자동 클램프 → PriceChart 에 그대로 전달.
  const visibleBars = useMemo<ChartBar[]>(
    () => (!isIntradayView && barCount ? bars.slice(-barCount) : bars),
    [bars, barCount, isIntradayView],
  );

  const showEmptyIntraday = isIntradayView && !intradayQuery.isLoading && !hasIntraday;

  // maPeriods: intraday·선차트 는 미표시. full 캔들 뷰만 granularity 별 상수.
  const maPeriods =
    isIntradayView || seriesKind === "line"
      ? undefined
      : granularity === "week"
        ? WEEK_MA_PERIODS
        : granularity === "month"
          ? MONTH_MA_PERIODS
          : DAY_MA_PERIODS;

  // 표시 봉 수가 period 미만인 MA 는 legend·라인 모두 제외 (봉개수 축소 시 자동 반영).
  // PriceChart 는 자체 가드로 series 생성만 스킵하지만 config effect 재실행은 maPeriodsKey 변화가
  // 있어야 하므로 상위에서 필터해 전달한다.
  const effectiveMaPeriods = useMemo(() => {
    if (!maPeriods) return undefined;
    const filtered = maPeriods.filter((p) => p <= visibleBars.length);
    return filtered.length > 0 ? filtered : undefined;
  }, [maPeriods, visibleBars.length]);

  // "최근 1년" 라벨은 250 fetch limit 와 짝인 문구 → full/day 에서만 정확. 다른 주기는 생략.
  // 봉개수를 사용자가 좁힌 경우에도 라벨은 부정확해지므로 생략.
  const showLabel =
    label && !isIntradayView && granularity === "day" && barCount === null;

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

  const currentPresets = BAR_COUNT_PRESETS[granularity];

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
          <h2 className="text-sm font-semibold text-muted-foreground">
            가격 차트
            {showLabel && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground/70">· {label}</span>
            )}
          </h2>
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
          <div className={groupWrapperCls} role="group" aria-label="차트 주기">
            {GRANULARITY_BUTTONS.map(({ value, label: btnLabel }) => {
              const active = granularity === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  aria-disabled={isIntradayView}
                  disabled={isIntradayView}
                  onClick={() => setGranularity(value)}
                  className={toolbarButtonCls(active, isIntradayView)}
                >
                  {btnLabel}
                </button>
              );
            })}
          </div>
          <div className={groupWrapperCls} role="group" aria-label="표시 봉 개수 프리셋">
            {currentPresets.map((preset) => {
              const active = barCount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  aria-disabled={isIntradayView}
                  disabled={isIntradayView}
                  onClick={() => setBarCount(preset)}
                  className={toolbarButtonCls(active, isIntradayView)}
                >
                  {preset}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={barCount === null}
              aria-disabled={isIntradayView}
              disabled={isIntradayView}
              onClick={() => setBarCount(null)}
              className={toolbarButtonCls(barCount === null, isIntradayView)}
            >
              전체
            </button>
          </div>
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
      {showEmptyIntraday ? (
        <div
          className="flex w-full items-center justify-center rounded-md text-sm text-muted-foreground"
          style={{ height: EMPTY_STATE_HEIGHT }}
        >
          당일 인트라데이 데이터 없음
        </div>
      ) : (
        <PriceChart
          bars={visibleBars}
          precision={0}
          timeVisible={isIntradayView}
          locked={isIntradayView}
          showVolume
          showLegend={!isIntradayView}
          maPeriods={effectiveMaPeriods}
          seriesKind={seriesKind}
        />
      )}
    </>
  );
};
