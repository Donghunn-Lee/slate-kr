"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CandlestickChart,
  LineChart,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { parseISO, startOfWeek, format } from "date-fns";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useIndexIntraday } from "@/features/index-quotes/useIndexIntraday";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import type {
  DomesticIndexCode,
  IndexCode,
} from "@/shared/constants/indices";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";
import { getPreviousKrxTradingDate } from "@/shared/utils/market";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { resampleToWeekly } from "@/shared/utils/resampleToWeekly";
import { cn } from "@/lib/utils";

type ViewMode = "intraday" | "full";
type Granularity = "day" | "week" | "month";
type SeriesKind = "candle" | "line";

type IndexChartProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[]; // ASC
  interactive?: boolean;
  // 해외 지수용 daily-only 모드. false 이면 useIndexQuotes/useIndexIntraday
  // 호출 없이 EOD 만 그린다. viewMode 토글 UI 도 숨긴다.
  intradayEnabled?: boolean;
};

const CELL_KEY: Record<DomesticIndexCode, "kospi" | "kosdaq" | "kospi200"> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KOSPI200: "kospi200",
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

// MA period 상수 — StockChartTabs 컨벤션 동일.
const DAY_MA_PERIODS: number[] = [5, 20, 60, 120];
const WEEK_MA_PERIODS: number[] = [13, 26];
const MONTH_MA_PERIODS: number[] = [6, 12];

// granularity 진입 시 초기 표시 창 — StockChartTabs 와 동일 기준.
// 프리셋 버튼 없이 기본값 + 직접입력 + 휠 역반영으로 조절.
const GRANULARITY_DEFAULT_BARS: Record<Granularity, number> = {
  day: 250,
  week: 52,
  month: 12,
};

const EMPTY_STATE_HEIGHT = 450;

// intraday bar time 은 kis-quote-fetch 의 kstToFakeUtcSec 로 인코딩된 fake-UTC epoch 초.
// KST 00:00 을 같은 규칙으로 인코딩하면 세션 경계 epoch 를 얻는다.
const dateToKstStartSec = (yyyyMmDd: string): number => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
};

const dailyToBars = (prices: IndexDailySnapshot[]): ChartBar[] =>
  prices.map((p) => ({
    time: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));

const intradayToBars = (bars: IndexIntradaySnapshot[]): ChartBar[] =>
  bars.map((b) => ({
    time: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

// dayBars → 월별 volume 합. resampleToMonthly 결과 date("YYYY-MM-01") 와 "YYYY-MM" 로 조인.
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

// resample 시그니처가 IndexDailySnapshot in/out 이라 ChartBar <-> shim.
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

// EOD 일봉 + 실시간 quote 병합. 지수 quote(IndexQuote) 에는 volume 이 없어
// 오늘 봉 volume 은 EOD 에 이미 있는 경우만 보존한다.
const mergeLiveDayBar = (
  eod: IndexDailySnapshot[],
  live: { price: number; open: number; high: number; low: number } | null,
  liveDate: string | undefined,
): ChartBar[] => {
  const eodBars = dailyToBars(eod);
  if (!live || !liveDate) return eodBars;
  const last = eod[eod.length - 1];
  const preservedVolume =
    last && last.date === liveDate ? last.volume : undefined;
  const liveBar: ChartBar = {
    time: liveDate,
    open: live.open,
    high: live.high,
    low: live.low,
    close: live.price,
    volume: preservedVolume,
  };
  if (last && last.date === liveDate) return [...eodBars.slice(0, -1), liveBar];
  return [...eodBars, liveBar];
};

export const IndexChart = ({
  indexCode,
  prices,
  interactive = true,
  intradayEnabled = true,
}: IndexChartProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [seriesKind, setSeriesKind] = useState<SeriesKind>("candle");
  const [barCount, setBarCount] = useState<number | null>(
    GRANULARITY_DEFAULT_BARS.day,
  );
  const [inputRevertNonce, setInputRevertNonce] = useState(0);
  const isIntradayView = intradayEnabled && viewMode === "intraday";

  // granularity 전환 시 표시 창을 해당 기본값으로 재설정 — StockChartTabs 와 대칭.
  useEffect(() => {
    setBarCount(GRANULARITY_DEFAULT_BARS[granularity]);
  }, [granularity]);

  // 홈 IndexSlate 와 캐시 공유 (동시 열림 시 네트워크 중복 제거).
  // 해외(intradayEnabled=false)면 훅은 호출되지만 결과는 무시 — CELL_KEY 로
  // 매핑 불가한 코드에서 데이터 접근을 시도하지 않는다.
  const intradayQuery = useIndexIntraday();
  const intradayData = intradayQuery.data;
  const { data: quotesData } = useIndexQuotes();

  const cellKey = intradayEnabled
    ? CELL_KEY[indexCode as DomesticIndexCode]
    : null;
  const rawIntraday =
    cellKey !== null ? intradayData?.quotes[cellKey] ?? null : null;
  const liveQuote =
    cellKey !== null ? quotesData?.quotes[cellKey].live ?? null : null;
  const liveDate = intradayEnabled ? quotesData?.date : undefined;

  // 오늘/전일 세션 경계 (fake-UTC epoch). liveDate 미도착 전에는 undefined.
  const todayStartSec = liveDate ? dateToKstStartSec(liveDate) : undefined;
  const prevStartSec = liveDate
    ? dateToKstStartSec(getPreviousKrxTradingDate(liveDate))
    : undefined;

  // intraday 필터: 당일 + 전일만. 전전일 이전은 데이터에서 제외.
  const intraday = useMemo<IndexIntradaySnapshot[] | null>(() => {
    if (!rawIntraday) return null;
    if (prevStartSec === undefined) return rawIntraday;
    return rawIntraday.filter((b) => b.timestamp >= prevStartSec);
  }, [rawIntraday, prevStartSec]);

  const intradayHasData = intraday !== null && intraday.length > 0;
  const renderIntraday = isIntradayView && intradayHasData;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 이므로 실패는 empty 를 동반.
  // stock-intraday 와 동일 계약 — 실패↔정상 empty(preopen/휴장) 구분 신호.
  const intradayFailed =
    cellKey !== null ? intradayData?.failed?.[cellKey] ?? false : false;
  // 실패는 항상 empty 를 동반하므로 failed 로 분기 우선순위 결정 — 두 분기는 상호 배타.
  const showFailedIntraday =
    isIntradayView &&
    !intradayQuery.isLoading &&
    !intradayHasData &&
    intradayFailed;
  const showEmptyIntraday =
    isIntradayView &&
    !intradayQuery.isLoading &&
    !intradayHasData &&
    !intradayFailed;

  const dayBars = useMemo<ChartBar[]>(
    () => mergeLiveDayBar(prices, liveQuote, liveDate),
    [prices, liveQuote, liveDate],
  );

  const weekBars = useMemo<ChartBar[]>(() => {
    const base = snapshotsToBars(resampleToWeekly(barsToSnapshots(dayBars)));
    const weekVolume = sumVolumeByWeek(dayBars);
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

  // isIntradayView 인데 데이터가 없으면 아래 failure/empty 블록이 PriceChart 를 대체하므로
  // 여기의 [] 는 실제로 렌더되지 않는다. day 로 silent fallback 하지 않는 것이 요점.
  const bars: ChartBar[] = renderIntraday
    ? intradayToBars(intraday ?? [])
    : isIntradayView
      ? []
      : granularity === "week"
        ? weekBars
        : granularity === "month"
          ? monthBars
          : dayBars;

  // maPeriods: intraday·선차트 는 미표시. full 캔들 뷰만 granularity 별 상수.
  const maPeriods =
    renderIntraday || seriesKind === "line"
      ? undefined
      : granularity === "week"
        ? WEEK_MA_PERIODS
        : granularity === "month"
          ? MONTH_MA_PERIODS
          : DAY_MA_PERIODS;

  // 데이터 길이 기준 MA 필터 — 창 밖 데이터로 SMA 계산 가능하므로 창 크기와 분리.
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
      setInputRevertNonce((v) => v + 1);
      return;
    }
    setBarCount(Math.min(Math.round(n), bars.length));
  };

  if (prices.length === 0 && !intradayHasData) {
    return <p className="text-sm text-muted-foreground">차트 데이터 없음</p>;
  }

  const toolbarButtonCls = (active: boolean, disabled = false) =>
    cn(
      "rounded-sm px-2 py-1 text-xs transition-colors",
      active
        ? "bg-lavender-bg text-lavender-accent font-medium"
        : "text-muted-foreground",
      !disabled && !active && "hover:text-foreground",
      disabled && "opacity-40",
    );

  const groupWrapperCls =
    "flex gap-0.5 rounded-md border border-subtle bg-elevated p-0.5";

  return (
    <>
      {/* 우측 정렬 단일 행. 당일/전체 그룹과 나머지 클러스터를 gap-4 로 벌려
          의미 구분(모바일에선 flex-wrap 로 두 그룹이 두 줄로 나뉨). */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-4">
        {intradayEnabled && (
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
        )}
        <div className="flex flex-wrap items-center gap-1.5">
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
              당일 차트를 일시적으로 불러오지 못했어요
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
          precision={2}
          timeVisible={renderIntraday}
          height={EMPTY_STATE_HEIGHT}
          interactive={interactive}
          locked={renderIntraday}
          dimBefore={renderIntraday ? todayStartSec : undefined}
          showVolume
          showLegend
          maPeriods={effectiveMaPeriods}
          seriesKind={seriesKind}
          visibleBars={renderIntraday ? undefined : barCount}
          onVisibleBarsChange={renderIntraday ? undefined : setBarCount}
        />
      )}
    </>
  );
};
