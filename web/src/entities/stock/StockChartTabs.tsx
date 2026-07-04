"use client";

import { useMemo, useState } from "react";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useStockIntraday } from "@/features/stock-intraday/useStockIntraday";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import type {
  ChartBar,
  IndexDailySnapshot,
} from "@/shared/types/quote";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { cn } from "@/lib/utils";

type Tab = "intraday" | "day" | "month";

type StockChartTabsProps = {
  ticker: string;
  prices: StockPriceSnapshot[]; // DESC from getDailyPrices
  label?: string;
};

const TAB_LABEL: Record<Tab, string> = {
  intraday: "당일",
  day: "일봉",
  month: "월봉",
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
// 라이브 quote 에는 volume 이 없어 histogram 이 오늘 봉을 스킵하는 걸 방지하기 위해,
// replace 경로에서만 EOD 오늘 volume 을 보존한다 (append 경로는 EOD 에 오늘 봉 없음).
const mergeLiveDayBar = (
  eod: ChartBar[],
  quote: { open: number; high: number; low: number; price: number } | null,
  date: string | undefined,
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
    volume: preservedVolume,
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
  // 기본 day: 폐장/장전엔 종목 intraday 응답이 완전히 비어 첫인상에 빈 상태를 보게 되므로,
  // 사용자가 명시적으로 "당일" 선택했을 때만 intraday 로드/폴링. IndexChart(intraday 기본
  // + silent fallback) 와 정책이 다르지만, 종목 intraday 는 전일 데이터 없이 오늘만 반환하는
  // endpoint 특성 때문에 fallback 이 무의미 — 예측 가능한 day 를 진입 기본으로.
  const [tab, setTab] = useState<Tab>("day");
  const isIntradayTab = tab === "intraday";

  // 헤더 폴링과 동일 queryKey — subscribeOnly 로 캐시만 구독, 네트워크 추가 0.
  const { data: quoteData } = useStockQuote(ticker, { subscribeOnly: true });
  // intraday 탭 활성 시에만 fetch/polling. 미활성 탭에서는 백그라운드 트래픽 0.
  const intradayQuery = useStockIntraday(ticker, { enabled: isIntradayTab });

  const dayBars = useMemo<ChartBar[]>(() => {
    const eod = stockPricesToBars(prices);
    return mergeLiveDayBar(eod, quoteData?.quote ?? null, quoteData?.date);
  }, [prices, quoteData]);

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

  const bars =
    tab === "intraday" ? intradayBars : tab === "month" ? monthBars : dayBars;

  const showEmptyIntraday =
    isIntradayTab && !intradayQuery.isLoading && !hasIntraday;

  if (prices.length === 0 && !hasIntraday) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">가격 데이터 없음</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          가격 차트
          {label && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground/70">· {label}</span>
          )}
        </h2>
        <div
          className="flex gap-1"
          role="tablist"
          aria-label="가격 차트 주기"
        >
          {(["intraday", "day", "month"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                tab === t
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
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
          bars={bars}
          precision={0}
          timeVisible={isIntradayTab}
          locked={isIntradayTab}
          showVolume={!isIntradayTab}
        />
      )}
    </>
  );
};
