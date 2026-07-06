"use client";

import { useMemo, useState } from "react";
import { PriceChart } from "@/entities/chart/PriceChart";
import { useIndexIntraday } from "@/features/index-quotes/useIndexIntraday";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";
import { getPreviousKrxTradingDate } from "@/shared/utils/market";
import { resampleToMonthly } from "@/shared/utils/resampleToMonthly";
import { cn } from "@/lib/utils";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";
type Tab = "intraday" | "day" | "month";

type IndexChartProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[]; // ASC
  interactive?: boolean;
};

const INDEX_LABEL: Record<IndexCode, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  KOSPI200: "코스피200",
};

const TAB_LABEL: Record<Tab, string> = {
  intraday: "당일",
  day: "일봉",
  month: "월봉",
};

const CELL_KEY: Record<IndexCode, "kospi" | "kosdaq" | "kospi200"> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KOSPI200: "kospi200",
};

// MA period 상수 — StockChartTabs 컨벤션 동일 (일봉 4개, 월봉 2개).
// intraday 는 미표시.
const DAY_MA_PERIODS: number[] = [5, 20, 60, 120];
const MONTH_MA_PERIODS: number[] = [6, 12];

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
// StockChartTabs.sumVolumeByMonth 미러 — 지수도 동일 패턴.
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

// 월봉 ChartBar 에 월별 합계 volume 재주입. resampleToMonthly 출력은 volume 을 담지 않으므로
// 일봉에서 뽑은 sumVolumeByMonth 를 time.slice(0,7) 로 매칭해 얹는다.
const injectMonthlyVolume = (
  monthBars: ChartBar[],
  monthVolume: Map<string, number>,
): ChartBar[] =>
  monthBars.map((b) => {
    if (typeof b.time !== "string") return b;
    const v = monthVolume.get(b.time.slice(0, 7));
    return v !== undefined ? { ...b, volume: v } : b;
  });

// 실시간 quote + date 로 오늘 봉 병합. mode='day' 는 그대로, mode='month' 는 이번 달 봉에 재반영.
// 지수 quote(IndexQuote) 에는 volume 이 없어 오늘 봉 volume=undefined. day/month 모두 histogram 은
// EOD 가 담긴 이전 봉까지만 그려지고 오늘 봉은 스킵된다 (PriceChart 의 volume undefined 스킵 규칙).
const mergeLiveBar = (
  eod: IndexDailySnapshot[],
  live: { price: number; open: number; high: number; low: number } | null,
  liveDate: string | undefined,
  mode: "day" | "month",
): ChartBar[] => {
  if (!live || !liveDate) {
    if (mode !== "month") return dailyToBars(eod);
    const monthBars = dailyToBars(resampleToMonthly(eod));
    return injectMonthlyVolume(monthBars, sumVolumeByMonth(dailyToBars(eod)));
  }
  const liveDaily: IndexDailySnapshot = {
    indexCode: eod[0]?.indexCode ?? "",
    date: liveDate,
    open: live.open,
    high: live.high,
    low: live.low,
    close: live.price,
    change: 0,
    changeRate: 0,
  };
  const last = eod[eod.length - 1];
  const mergedDaily: IndexDailySnapshot[] =
    last && last.date === liveDate
      ? [...eod.slice(0, -1), liveDaily]
      : [...eod, liveDaily];
  if (mode !== "month") return dailyToBars(mergedDaily);
  const dayBars = dailyToBars(mergedDaily);
  const monthBars = dailyToBars(resampleToMonthly(mergedDaily));
  return injectMonthlyVolume(monthBars, sumVolumeByMonth(dayBars));
};

export const IndexChart = ({ indexCode, prices, interactive = true }: IndexChartProps) => {
  const [tab, setTab] = useState<Tab>("intraday");

  // 홈 IndexSlate 와 캐시 공유 (동시 열림 시 네트워크 중복 제거).
  const { data: intradayData } = useIndexIntraday();
  const { data: quotesData } = useIndexQuotes();

  const cellKey = CELL_KEY[indexCode];
  const rawIntraday = intradayData?.quotes[cellKey] ?? null;
  const liveQuote = quotesData?.quotes[cellKey].live ?? null;
  const liveDate = quotesData?.date;

  // 오늘/전일 세션 경계 (fake-UTC epoch). liveDate 미도착 전에는 undefined.
  const todayStartSec = liveDate ? dateToKstStartSec(liveDate) : undefined;
  const prevStartSec = liveDate
    ? dateToKstStartSec(getPreviousKrxTradingDate(liveDate))
    : undefined;

  // intraday 필터: 당일 + 전일만. 전전일 이전은 데이터에서 제외.
  // liveDate 미도착 시 원본 그대로 (필터 대신 fallback 은 아래 renderMode 로).
  const intraday = useMemo<IndexIntradaySnapshot[] | null>(() => {
    if (!rawIntraday) return null;
    if (prevStartSec === undefined) return rawIntraday;
    return rawIntraday.filter((b) => b.timestamp >= prevStartSec);
  }, [rawIntraday, prevStartSec]);

  // intraday 데이터 없으면 day 로 silent fallback (preopen/장 마감 시간대).
  const intradayHasData = intraday !== null && intraday.length > 0;
  const renderMode: "intraday" | "day" | "month" =
    tab === "intraday" ? (intradayHasData ? "intraday" : "day") : tab;

  const bars = useMemo<ChartBar[]>(() => {
    if (renderMode === "intraday") return intradayToBars(intraday ?? []);
    return mergeLiveBar(prices, liveQuote, liveDate, renderMode);
  }, [renderMode, intraday, prices, liveQuote, liveDate]);

  if (prices.length === 0 && !intradayHasData) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {INDEX_LABEL[indexCode]}
        </h2>
        <p className="text-sm text-muted-foreground">차트 데이터 없음</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {INDEX_LABEL[indexCode]}
        </h2>
        <div
          className="flex gap-1"
          role="tablist"
          aria-label={`${INDEX_LABEL[indexCode]} 차트 주기`}
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
      <PriceChart
        bars={bars}
        precision={2}
        timeVisible={renderMode === "intraday"}
        interactive={interactive}
        locked={renderMode === "intraday"}
        dimBefore={renderMode === "intraday" ? todayStartSec : undefined}
        showLegend={renderMode !== "intraday"}
        showVolume
        maPeriods={
          renderMode === "day"
            ? DAY_MA_PERIODS
            : renderMode === "month"
              ? MONTH_MA_PERIODS
              : undefined
        }
      />
    </>
  );
};
