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
  const intraday = intradayData?.quotes[cellKey] ?? null;
  const liveQuote = quotesData?.quotes[cellKey].live ?? null;
  const liveDate = quotesData?.date;

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
      />
    </>
  );
};
