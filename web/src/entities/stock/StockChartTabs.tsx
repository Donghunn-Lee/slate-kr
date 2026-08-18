"use client";

import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "@/entities/chart/PriceChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStockIntraday } from "@/features/stock-intraday/useStockIntraday";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import type { ChartBar, IndexDailySnapshot } from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { isKrxBeforeMarketOpen } from "@/shared/utils/market";
import { mergeLiveDayBar } from "@/shared/utils/mergeLiveDayBar";
import { mergeLiveIntradayBar } from "@/shared/utils/mergeLiveIntradayBar";
import { resampleIntradayBars } from "@/shared/utils/resampleIntradayBars";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { resampleToWeekly } from "@/shared/utils/resampleToWeekly";
import { parseISO, startOfWeek, format } from "date-fns";
import { RefreshCw, WifiOff } from "lucide-react";
import {
  GRANULARITY_BUTTONS,
  SERIES_KIND_BUTTONS,
  TOOLBAR_BUTTON_CLS,
  TOOLBAR_GROUP_CLS,
  TOOLBAR_INPUT_CLS,
  VIEW_MODE_BUTTONS,
  type Granularity,
  type SeriesKind,
  type ViewMode,
} from "@/entities/chart/chartToolbar";
import { cn } from "@/lib/utils";

type StockChartTabsProps = {
  ticker: string;
  prices: StockPriceSnapshot[]; // DESC from getDailyPrices
};

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

// KST 정규장 창 (분). 확장 세션(NXT 프리/애프터) 판정에 사용.
const REGULAR_START_KST_MIN = 9 * 60;
const REGULAR_END_KST_MIN = 15 * 60 + 30;

// intradayBars.time 은 kstToFakeUtcSec 로 KST 시각을 UTC 위장 인코딩 —
// UTC 시각으로 그대로 읽으면 KST 시각(분 단위) 이 나온다.
const barKstMinuteOfDay = (t: number): number => {
  const d = new Date(t * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
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

// EOD + 라이브 quote 병합은 shared/utils/mergeLiveDayBar 로 이관 (무효-OHL 도지 게이트 포함).

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

// 차트 탭 고정 높이 — 잠정치, 실물 확인 후 조정 여지. empty/failed 상태 컨테이너도 동일 값 사용.
const CHART_HEIGHT_MOBILE = 320;
const CHART_HEIGHT_DESKTOP = 450;

// 시장 구분 뱃지 — 2행 라벨에서 데이터 소스 스코프(KRX 정규장 / KRX+NXT 확장 세션) 를 표시.
// StockHeaderLivePrice 의 "일시 지연" 배지 스타일 재사용 — 소형 무채 outline.
type MarketScope = "KRX" | "KRX+NXT";

const MARKET_SCOPE_TOOLTIP: Record<MarketScope, string> = {
  KRX: "정규장 09:00–15:30 기준",
  "KRX+NXT": "08:00–20:00 · NXT 프리마켓·애프터마켓 포함",
};

const MarketScopeBadge = ({ scope }: { scope: MarketScope }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        role="button"
        tabIndex={0}
        aria-label={`${scope} 시장 구분`}
        className="inline-flex cursor-help items-center rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {scope}
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="text-caption">
      {MARKET_SCOPE_TOOLTIP[scope]}
    </TooltipContent>
  </Tooltip>
);

export const StockChartTabs = ({ ticker, prices }: StockChartTabsProps) => {
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? CHART_HEIGHT_MOBILE : CHART_HEIGHT_DESKTOP;
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
    // 정규장 개장 전(pre · preopen)엔 quote를 null로 게이트 — NXT 프리마켓 실봉이
    // KRX 라벨 일봉에 당일 캔들로 유입되는 것 차단.
    const gatedQuote = isKrxBeforeMarketOpen(quoteData?.session)
      ? null
      : quoteData?.quote ?? null;
    return mergeLiveDayBar(eod, gatedQuote, quoteData?.date);
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

  const rawIntradayBars = intradayQuery.data?.bars ?? EMPTY_BARS;
  // 헤더 60s 폴링 quote 로 최신 봉 close 대체 — 서버 캐시 miss 사이 gap 마스킹.
  // previousDay / date 축 어긋남은 유틸 가드가 처리.
  const intradayBars = useMemo<ChartBar[]>(
    () =>
      mergeLiveIntradayBar(
        rawIntradayBars,
        quoteData?.quote ?? null,
        quoteData?.date,
        intradayQuery.data?.date,
        intradayQuery.data?.previousDay ?? false,
      ),
    [rawIntradayBars, quoteData, intradayQuery.data?.date, intradayQuery.data?.previousDay],
  );
  const hasIntraday = intradayBars.length > 0;
  // route 가 완전 fetch 실패 시 true. bars 는 항상 [] 이므로 실패는 empty 를 동반.
  const intradayFailed = intradayQuery.data?.failed ?? false;
  // 전일 스냅샷 fallback (preopen · 주말 · 공휴일). 라벨과 baseline 분기에 사용.
  const isPreviousDay = intradayQuery.data?.previousDay ?? false;

  // NXT 확장 세션 유입 판정 — sentinel 필터 후에도 정규장(09:00~15:30) 밖 봉이 하나라도
  // 있으면 NXT 상장 종목. 데이터 파생 — 마스터 플래그 불필요.
  const hasExtendedSessionBar = useMemo<boolean>(
    () =>
      intradayBars.some((b) => {
        if (typeof b.time !== "number") return false;
        const m = barKstMinuteOfDay(b.time);
        return m < REGULAR_START_KST_MIN || m > REGULAR_END_KST_MIN;
      }),
    [intradayBars],
  );

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

  // 전일 종가 기준선 — intraday 뷰 한정. LiveQuoteCore.change = "전일 대비" 계약에서
  // price - change 로 역산. 지수 IndexIntradaySnapshot 의 close - change 와 동형.
  // 전일 스냅샷 fallback 표시 중엔 baseline 대상(오늘 quote) 과 봉(어제) 이 어긋나므로 비활성.
  const intradayBaseline = useMemo<number | undefined>(() => {
    if (!isIntradayView || !hasIntraday || isPreviousDay) return undefined;
    const q = quoteData?.quote;
    if (!q) return undefined;
    const prev = q.price - q.change;
    return prev > 0 ? prev : undefined;
  }, [isIntradayView, hasIntraday, isPreviousDay, quoteData]);

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
        <h2 className="mb-3 text-body font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-body text-muted-foreground">가격 데이터 없음</p>
      </>
    );
  }

  // 2행 라벨 — 기준 날짜 + 시장 스코프.
  //   당일 뷰: intraday 응답의 tradingDate. previousDay 이면 "MM-DD 마감 기준", 아니면 "MM-DD 기준".
  //   전체 뷰: dayBars 마지막 봉 date (mergeLiveDayBar 로 오늘 봉이 얹혔으면 오늘).
  //   시장 스코프: 당일 + hasExtendedSessionBar 만 KRX+NXT, 나머지는 KRX
  //   (일봉은 KRX EOD 소스이므로 NXT 종목이어도 KRX).
  const lastDayBarDate =
    typeof dayBars[dayBars.length - 1]?.time === "string"
      ? (dayBars[dayBars.length - 1].time as string)
      : undefined;

  const chartDateLabel: string | null = (() => {
    if (isIntradayView) {
      const d = intradayQuery.data?.date;
      if (!d || !hasIntraday) return null;
      return isPreviousDay ? `${d.slice(5)} 마감 기준` : `${d.slice(5)} 기준`;
    }
    return lastDayBarDate ? `${lastDayBarDate.slice(5)} 기준` : null;
  })();

  const marketScope: MarketScope =
    isIntradayView && hasExtendedSessionBar ? "KRX+NXT" : "KRX";

  return (
    <>
      {/* 헤더 래퍼: 제목 → 기준일 → 툴바 순으로 3행 스택.
          제목·기준일은 mt-1(4px) 로 밀착, 툴바는 mt-3(12px) 로 벌려
          툴바↔차트(mb-3) 와 동일 간격. mb-3 로 차트와의 간격은
          chartDateLabel 유무와 무관하게 유지. */}
      <div className="mb-3">
        <h2 className="text-body font-semibold text-muted-foreground">
          가격 차트
          <span className="ml-1.5 text-caption font-normal text-muted-foreground/70">
            · 기간별 가격 흐름과 거래량
          </span>
        </h2>
        {chartDateLabel && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground/70">
            <span>{chartDateLabel}</span>
            <MarketScopeBadge scope={marketScope} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 sm:gap-4">
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
          <div className="flex flex-wrap items-center gap-1.5">
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
            {isIntradayView ? (
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
                      onClick={() => setGranularity(value)}
                      className={TOOLBAR_BUTTON_CLS(active)}
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
          </div>
        </div>
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
          {intradayQuery.data?.session === "pre" ||
          intradayQuery.data?.session === "preopen"
            ? "정규장 개장 전입니다 · 09:00 시작"
            : "당일 인트라데이 데이터 없음"}
        </div>
      ) : (
        <PriceChart
          bars={bars}
          precision={0}
          timeVisible={isIntradayView}
          height={chartHeight}
          intraday={isIntradayView}
          showVolume
          showLegend
          maPeriods={effectiveMaPeriods}
          seriesKind={seriesKind}
          baseline={intradayBaseline}
          visibleBars={isIntradayView ? undefined : barCount}
          onVisibleBarsChange={isIntradayView ? undefined : setBarCount}
        />
      )}
    </>
  );
};
