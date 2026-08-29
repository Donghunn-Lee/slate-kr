"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { parseISO, startOfWeek, format } from "date-fns";
import { PriceChart } from "@/entities/chart/PriceChart";
import { ResetViewButton } from "@/entities/chart/ResetViewButton";
import {
  GRANULARITY_BUTTONS,
  INTRADAY_INTERVAL_BUTTONS,
  INTRADAY_INTERVAL_DEFAULT,
  SERIES_KIND_BUTTONS,
  TOOLBAR_BUTTON_CLS,
  TOOLBAR_GROUP_CLS,
  TOOLBAR_INPUT_CLS,
  VIEW_MODE_BUTTONS,
  type Granularity,
  type SeriesKind,
  type ViewMode,
} from "@/entities/chart/chartToolbar";
import { toIndexDisplayBars } from "@/entities/index/toIndexDisplayBars";
import { useIndexIntraday } from "@/features/index-quotes/useIndexIntraday";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import { useOverseasIndexIntraday } from "@/features/index-quotes/useOverseasIndexIntraday";
import { useOverseasIndexQuotes } from "@/features/index-quotes/useOverseasIndexQuotes";
import {
  getIndexMeta,
  INDICES_WITHOUT_VOLUME,
  isOverseasIntradayCode,
  type DomesticIndexCode,
  type IndexCode,
  type OverseasIndexCode,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  IndexQuote,
} from "@/shared/types/quote";
import {
  getPreviousKrxTradingDate,
  getPreviousUsTradingDate,
  isKrxBeforeMarketOpen,
} from "@/shared/utils/market";
import { mergeLiveDayBar, type LiveQuoteForMerge } from "@/shared/utils/mergeLiveDayBar";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { resampleToWeekly } from "@/shared/utils/resampleToWeekly";
import { cn } from "@/lib/utils";

type IndexChartProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[]; // ASC
  interactive?: boolean;
  // 해외 지수용 daily-only 모드. false 이면 useIndexQuotes/useIndexIntraday
  // 호출 없이 EOD 만 그린다. viewMode 토글 UI 도 숨긴다.
  intradayEnabled?: boolean;
};

// fake-UTC 초 → ET 로컬 캘린더 날짜(YYYY-MM-DD). 인코딩 대칭 — Date.UTC 로 위장했으므로
// getUTC* 가 원래 ET 컴포넌트를 돌려준다.
const fakeUtcSecToLocalDate = (sec: number): string => {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// 해외 quote → 일봉 병합 게이트. quote.time.date (거래소 로컬 YYYYMMDD) 를
// EOD 포맷 (YYYY-MM-DD) 로 변환한 뒤 latestDaily.date 보다 신선할 때만 반환.
//  · quote 미도착 / time=null(.DJI 등 output2 부재) → undefined (자연 차단)
//  · latestDaily 없음 / date length 비정상 → undefined
//  · 변환된 date <= latestDailyDate → undefined (EOD 가 이미 커버 — 이중 삽입 방지)
// 폐장 후에도 quoteDate > latestDailyDate 인 동안(EOD D+1 도착 전) 마지막 세션 봉 유지 —
// 의도된 동작 (헤더 quote 신선도와 차트 기준일 갭 해소).
export const overseasQuoteMergeDate = (
  quote: IndexQuote | null,
  latestDailyDate: string | null,
): string | undefined => {
  if (!quote?.time || !latestDailyDate) return undefined;
  const raw = quote.time.date;
  if (raw.length !== 8) return undefined;
  const converted = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return converted > latestDailyDate ? converted : undefined;
};

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

// 차트 높이 — StockChartTabs 와 동일 축. failed/empty 상태 컨테이너와 PriceChart height 공용.
const CHART_HEIGHT_MOBILE = 320;
const CHART_HEIGHT_DESKTOP = 450;

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

// EOD 일봉 + 실시간 quote 병합은 shared/utils/mergeLiveDayBar 로 이관.
// 지수/종목 모두 동일 무효-OHL 게이트 + 도지 합성 규칙을 공유한다.

export const IndexChart = ({
  indexCode,
  prices,
  interactive = true,
  intradayEnabled = true,
}: IndexChartProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [intradayInterval, setIntradayInterval] = useState<number>(
    INTRADAY_INTERVAL_DEFAULT,
  );
  const [seriesKind, setSeriesKind] = useState<SeriesKind>("candle");
  const [barCount, setBarCount] = useState<number | null>(
    GRANULARITY_DEFAULT_BARS.day,
  );
  const [inputRevertNonce, setInputRevertNonce] = useState(0);
  // 툴바 "기본 배율" 버튼 트리거. 증가 시 PriceChart 가 현재 뷰의 초기 range 재적용.
  const [resetKey, setResetKey] = useState(0);
  // 사용자가 pan/zoom 을 한 번이라도 했는지 — 버튼 disabled 판정용. PriceChart 첫 조작
  // 콜백으로 true, 리셋/뷰전환/주기전환/간격전환 시 false.
  const [hasUserPanned, setHasUserPanned] = useState(false);
  const isIntradayView = intradayEnabled && viewMode === "intraday";
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? CHART_HEIGHT_MOBILE : CHART_HEIGHT_DESKTOP;

  // granularity 전환 시 표시 창을 해당 기본값으로 재설정 — StockChartTabs 와 대칭.
  useEffect(() => {
    setBarCount(GRANULARITY_DEFAULT_BARS[granularity]);
  }, [granularity]);

  // 뷰/주기/간격 전환 → PriceChart 내부 pan/zoom gate 도 초기화되므로 상위 flag 도 동기 리셋.
  useEffect(() => {
    setHasUserPanned(false);
  }, [viewMode, granularity, intradayInterval]);

  // 홈 IndexSlate 와 캐시 공유 (동시 열림 시 네트워크 중복 제거).
  // 국내/해외 훅을 모두 호출하고 지수 리전에 따라 소비 소스를 선택한다.
  // React Query 가 queryKey 로 dedup 하므로 다른 컴포넌트와 네트워크 중복 없음.
  const isOverseasIntraday = isOverseasIntradayCode(indexCode);
  const isOverseasIndex = getIndexMeta(indexCode).region === "overseas";
  const domesticIntradayQuery = useIndexIntraday();
  const overseasIntradayQuery = useOverseasIndexIntraday();
  const { data: quotesData } = useIndexQuotes();
  // 해외 지수 라이브 quote — 8종 전부. 헤더(IndexDetailPane)가 이미 소비 중이라
  // React Query dedup 로 신규 트래픽 없음.
  const { data: overseasQuotesData } = useOverseasIndexQuotes();

  const intradayQuery = isOverseasIntraday
    ? overseasIntradayQuery
    : domesticIntradayQuery;

  const domesticCode: DomesticIndexCode | null =
    intradayEnabled && !isOverseasIntraday
      ? (indexCode as DomesticIndexCode)
      : null;
  const overseasCode: OverseasIntradayCode | null =
    intradayEnabled && isOverseasIntraday
      ? (indexCode as OverseasIntradayCode)
      : null;

  const rawIntraday: IndexIntradaySnapshot[] | null = isOverseasIntraday
    ? overseasCode !== null
      ? overseasIntradayQuery.data?.quotes[overseasCode] ?? null
      : null
    : domesticCode !== null
      ? domesticIntradayQuery.data?.quotes[domesticCode] ?? null
      : null;

  // 오늘 세션 date — 리전별 소스:
  //  · 국내: /api/index-quotes 의 date (서버 기준 KST tradingDate)
  //  · 해외: 최신 intraday 봉의 ET 캘린더 날짜 (client clock 대신 데이터-파생 —
  //         feed 개시 지연 시 자동으로 "전일" 로 유지되어 라벨/차트가 정직해진다)
  const overseasLatestDate =
    isOverseasIntraday && rawIntraday && rawIntraday.length > 0
      ? fakeUtcSecToLocalDate(rawIntraday[rawIntraday.length - 1].timestamp)
      : undefined;
  const liveDate = isOverseasIntraday
    ? overseasLatestDate
    : intradayEnabled
      ? quotesData?.date
      : undefined;

  // 오늘/전일 세션 경계 (fake-UTC epoch). liveDate 미도착 전에는 undefined.
  // dateToKstStartSec 는 순수 캘린더 산술이라 ET 에도 동일 트릭 재사용.
  const todayStartSec = liveDate ? dateToKstStartSec(liveDate) : undefined;
  const prevStartSec = liveDate
    ? dateToKstStartSec(
        isOverseasIntraday
          ? getPreviousUsTradingDate(liveDate)
          : getPreviousKrxTradingDate(liveDate),
      )
    : undefined;

  // intraday 필터: 당일 + 전일만. 전전일 이전은 데이터에서 제외.
  const intraday = useMemo<IndexIntradaySnapshot[] | null>(() => {
    if (!rawIntraday) return null;
    if (prevStartSec === undefined) return rawIntraday;
    return rawIntraday.filter((b) => b.timestamp >= prevStartSec);
  }, [rawIntraday, prevStartSec]);

  // 국내: /api/index-quotes 의 live. 해외: /api/overseas-index-quotes 직결 (헤더와 동일 소스).
  // 정규장 개장 전(pre · preopen)엔 domestic quote 를 null 로 게이트 — 개장 전 당일
  // 지수봉이 EOD 축에 유입되는 것 차단 (StockChartTabs 와 동형).
  const domesticLiveQuote =
    domesticCode !== null && !isKrxBeforeMarketOpen(quotesData?.session)
      ? quotesData?.quotes[domesticCode].live ?? null
      : null;
  const overseasQuote: IndexQuote | null = isOverseasIndex
    ? overseasQuotesData?.quotes[indexCode as OverseasIndexCode] ?? null
    : null;
  // 병합 게이트: quote.time.date > latestDaily.date (converted). time=null(.DJI) 자연 차단.
  const latestDailyDate =
    prices.length > 0 ? prices[prices.length - 1].date : null;
  const overseasMergeDate = overseasQuoteMergeDate(
    overseasQuote,
    latestDailyDate,
  );
  const overseasLiveQuote: LiveQuoteForMerge | null = overseasQuote
    ? {
        open: overseasQuote.open,
        high: overseasQuote.high,
        low: overseasQuote.low,
        price: overseasQuote.price,
      }
    : null;
  const liveQuote: LiveQuoteForMerge | null = isOverseasIndex
    ? overseasLiveQuote
    : domesticLiveQuote;
  const mergeDate = isOverseasIndex ? overseasMergeDate : liveDate;

  const intradayHasData = intraday !== null && intraday.length > 0;
  const renderIntraday = isIntradayView && intradayHasData;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 이므로 실패는 empty 를 동반.
  const intradayFailed = isOverseasIntraday
    ? overseasCode !== null
      ? overseasIntradayQuery.data?.failed?.[overseasCode] ?? false
      : false
    : domesticCode !== null
      ? domesticIntradayQuery.data?.failed?.[domesticCode] ?? false
      : false;
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
    () => mergeLiveDayBar(dailyToBars(prices), liveQuote, mergeDate),
    [prices, liveQuote, mergeDate],
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

  // 국내 intraday: START 라벨 snapshots → 리샘플+END 라벨 (`toIndexDisplayBars`).
  // 해외 intraday: 서버가 10분 리샘플로 이미 반환 → snapshot → ChartBar 직결.
  const intradayDisplayBars = useMemo<ChartBar[]>(() => {
    if (!renderIntraday || !intraday) return [];
    return isOverseasIntraday
      ? intradayToBars(intraday)
      : toIndexDisplayBars(intraday, intradayInterval);
  }, [renderIntraday, intraday, isOverseasIntraday, intradayInterval]);

  // isIntradayView 인데 데이터가 없으면 아래 failure/empty 블록이 PriceChart 를 대체하므로
  // 여기의 [] 는 실제로 렌더되지 않는다. day 로 silent fallback 하지 않는 것이 요점.
  const bars: ChartBar[] = renderIntraday
    ? intradayDisplayBars
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

  // 전일 종가 기준선 — intraday 뷰 한정. 오늘 세션 첫 봉의 (close - change) 로 역산.
  // IndexIntradaySnapshot.change 는 국내·해외 모두 lib/indices.ts 에서
  // close - prevClose 로 채워지므로 동일 산식이 성립.
  const intradayBaseline = useMemo<number | undefined>(() => {
    if (!renderIntraday || !intraday || todayStartSec === undefined) return undefined;
    const first = intraday.find((b) => b.timestamp >= todayStartSec);
    if (!first) return undefined;
    const prev = first.close - first.change;
    return prev > 0 ? prev : undefined;
  }, [renderIntraday, intraday, todayStartSec]);

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
    return <p className="text-body text-muted-foreground">차트 데이터 없음</p>;
  }

  return (
    <>
      {/* 우측 정렬 단일 행. 모든 그룹이 래퍼 직계 자식 — wrap 단위 = 개별 그룹.
          모바일 gap-2 로 좁혀 1행 성립을 노리고, sm+ 는 gap-4 로 여백 확보. */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 sm:gap-4">
        {intradayEnabled && (
          <div className={TOOLBAR_GROUP_CLS} role="group" aria-label="차트 뷰">
            {VIEW_MODE_BUTTONS.map(({ value, label: btnLabel }) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewMode === value}
                onClick={() => setViewMode(value)}
                className={TOOLBAR_BUTTON_CLS(viewMode === value)}
              >
                {btnLabel}
              </button>
            ))}
          </div>
        )}
        <div className={TOOLBAR_GROUP_CLS} role="group" aria-label="차트 종류">
          {SERIES_KIND_BUTTONS.map(({ value, label: btnLabel, Icon }) => {
            const active = seriesKind === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={btnLabel}
                aria-pressed={active}
                onClick={() => setSeriesKind(value)}
                className={TOOLBAR_BUTTON_CLS(active)}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {isIntradayView && !isOverseasIntraday ? (
          <div className={TOOLBAR_GROUP_CLS} role="group" aria-label="분봉 간격">
            {INTRADAY_INTERVAL_BUTTONS.map((m) => {
              const active = intradayInterval === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setIntradayInterval(m)}
                  className={TOOLBAR_BUTTON_CLS(active)}
                >
                  {m}분
                </button>
              );
            })}
          </div>
        ) : (
          <div className={TOOLBAR_GROUP_CLS} role="group" aria-label="차트 주기">
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
                  className={TOOLBAR_BUTTON_CLS(active, isIntradayView)}
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
          className={cn(TOOLBAR_INPUT_CLS, isIntradayView && "opacity-40")}
        />
        <ResetViewButton
          onClick={() => {
            // 봉수를 초기값으로 되돌리지 않으면 PriceChart resetKey effect 가 "현재 barCount"
            // (=사용자 팬/줌 후 갱신된 값) 로 range 를 재계산 → 시각적 변화 거의 없음.
            setBarCount(GRANULARITY_DEFAULT_BARS[granularity]);
            setResetKey((k) => k + 1);
            setHasUserPanned(false);
          }}
          // pan/zoom 미조작 상태에서 비활성. EOD 뷰는 추가로 barCount 가 초기값이어야 pristine.
          // intraday 뷰는 barCount 프리셋 개념이 없어 hasUserPanned 만으로 판정.
          disabled={
            !hasUserPanned &&
            (isIntradayView || barCount === GRANULARITY_DEFAULT_BARS[granularity])
          }
        />
      </div>
      {showFailedIntraday ? (
        <div
          className="flex w-full flex-col items-center justify-center gap-4 rounded-md border border-subtle bg-elevated"
          style={{ height: chartHeight }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
            <WifiOff
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-body font-medium text-foreground">
              당일 차트를 일시적으로 불러오지 못했어요
            </p>
            <p className="text-caption text-muted-foreground">
              잠시 후 다시 시도해 주세요
            </p>
          </div>
          <button
            type="button"
            onClick={() => intradayQuery.refetch()}
            disabled={intradayQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-background px-3 py-1.5 text-caption text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-subtle disabled:hover:text-muted-foreground"
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
          className="flex w-full items-center justify-center rounded-md text-body text-muted-foreground"
          style={{ height: chartHeight }}
        >
          당일 인트라데이 데이터 없음
        </div>
      ) : (
        <PriceChart
          bars={bars}
          precision={2}
          timeVisible={renderIntraday}
          height={chartHeight}
          interactive={interactive}
          intraday={renderIntraday}
          dimBefore={renderIntraday ? todayStartSec : undefined}
          // 해외 지수 분봉은 KIS cntg_vol 이 항상 0 (collector/fetch_overseas_intraday.py 실측).
          // INDICES_WITHOUT_VOLUME 등재 지수(SPX·NDX)는 daily 도 volume=0 이라 전 뷰 숨김.
          showVolume={
            !(isOverseasIndex && isIntradayView) &&
            !INDICES_WITHOUT_VOLUME.has(indexCode)
          }
          showLegend
          maPeriods={effectiveMaPeriods}
          seriesKind={seriesKind}
          baseline={intradayBaseline}
          visibleBars={renderIntraday ? undefined : barCount}
          onVisibleBarsChange={renderIntraday ? undefined : setBarCount}
          resetKey={resetKey}
          onUserInteract={() => setHasUserPanned(true)}
        />
      )}
    </>
  );
};
