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
  }));

const intradayToBars = (bars: IndexIntradaySnapshot[]): ChartBar[] =>
  bars.map((b) => ({
    time: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));

// 실시간 quote + date 로 오늘 봉 병합. mode='day' 는 그대로, mode='month' 는 이번 달 봉에 재반영.
const mergeLiveBar = (
  eod: IndexDailySnapshot[],
  live: { price: number; open: number; high: number; low: number } | null,
  liveDate: string | undefined,
  mode: "day" | "month",
): ChartBar[] => {
  if (!live || !liveDate) {
    return mode === "month" ? dailyToBars(resampleToMonthly(eod)) : dailyToBars(eod);
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
  return mode === "month"
    ? dailyToBars(resampleToMonthly(mergedDaily))
    : dailyToBars(mergedDaily);
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
      />
    </>
  );
};
