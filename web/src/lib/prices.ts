import { cache } from "react";
import type {
  LatestPriceSummary,
  PriceStats,
  StockPriceSnapshot,
  TickerPriceSummary,
} from "@/shared/types/stock";
import { format, parseISO, subMonths, subYears } from "date-fns";
import { generateDailyBars, listTradingDates, type DemoDailyBar } from "@/lib/demo/price-model";
import {
  getDemoEntry,
  getDemoEodDate,
  getDemoHistoryStart,
  type DemoUniverseEntry,
} from "@/lib/demo/universe";

type DailyPriceRow = {
  id: number;
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  market_cap: number | null;
  base_price: number | null;
};

// 무거래일의 open=high=low=0 fill 봉을 서빙 경계에서 flat(close)로 정규화 — 캔들 축 붕괴·52주
// 저가 0원만 방지한다. 부분 0(예: open만 0)은 통과.
export const rowToSnapshot = (row: DailyPriceRow): StockPriceSnapshot => {
  const isFlatFill = row.open === 0 && row.high === 0 && row.low === 0;
  return {
    ticker: row.ticker,
    date: row.date,
    open: isFlatFill ? row.close : row.open,
    high: isFlatFill ? row.close : row.high,
    low: isFlatFill ? row.close : row.low,
    close: row.close,
    volume: row.volume,
    marketCap: row.market_cap,
    basePrice: row.base_price,
  };
};

const barToSnapshot = (entry: DemoUniverseEntry, bar: DemoDailyBar): StockPriceSnapshot => ({
  ticker: entry.ticker,
  date: bar.date,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
  marketCap: entry.shares === null ? null : bar.close * entry.shares,
  basePrice: bar.basePrice,
});

// 최신 limit 건, DESC. React.cache 로 동일 (ticker, limit) 호출을 요청 단위 dedupe —
// 같은 요청 내 다른 소비자가 다른 limit 을 넘기면 별도 생성이 일어난다.
const fetchDailyBarsDesc = cache(
  async (ticker: string, limit: number): Promise<StockPriceSnapshot[]> => {
    const entry = await getDemoEntry(ticker);
    if (!entry) return [];
    const end = getDemoEodDate();
    const dates = listTradingDates(getDemoHistoryStart(entry), end);
    if (dates.length === 0) return [];
    const from = dates[Math.max(0, dates.length - limit)];
    return generateDailyBars(ticker, entry.profile, from, end)
      .map((bar) => barToSnapshot(entry, bar))
      .reverse();
  }
);

export const getDailyPrices = async (
  ticker: string,
  limit = 365
): Promise<StockPriceSnapshot[]> => fetchDailyBarsDesc(ticker, limit);

// EOD 가 존재하는 최신 거래일. 상장 전·미등록 종목은 null.
export const getLatestKstDate = async (ticker: string): Promise<string | null> => {
  // limit=2 로 고정 — 헤더가 getDailyPrices(ticker, 2) 를 호출하는 경로와 캐시 키가 일치해야
  // 요청 단위 dedupe 가 성립한다.
  const rows = await fetchDailyBarsDesc(ticker, 2);
  return rows[0]?.date ?? null;
};

export const getLatestPrice = cache(async (ticker: string): Promise<StockPriceSnapshot | null> => {
  const rows = await fetchDailyBarsDesc(ticker, 2);
  return rows[0] ?? null;
});

const changeFrom = (
  close: number,
  basis: number | null
): { change: number | null; changeRate: number | null } => {
  if (basis === null) return { change: null, changeRate: null };
  const change = close - basis;
  return { change, changeRate: basis === 0 ? null : (change / basis) * 100 };
};

// tickers 각각의 최신 종가·등락·거래량. 등락 기준은 basePrice(기준가).
// 결과에서 누락된 ticker(미등록·상장 전)는 caller 가 부재로 처리한다.
export const getLatestPricesByTickers = async (
  tickers: string[]
): Promise<Record<string, LatestPriceSummary>> => {
  const result: Record<string, LatestPriceSummary> = {};
  for (const ticker of tickers) {
    const [latest] = await fetchDailyBarsDesc(ticker, 1);
    if (!latest) continue;
    result[ticker] = {
      close: latest.close,
      date: latest.date,
      ...changeFrom(latest.close, latest.basePrice),
      volume: latest.volume,
    };
  }
  return result;
};

// tickers 각각의 최신 행(활성 종목만) + 등락. 미등록·상장 전 종목은 결과에서 빠진다.
export const getPriceSummariesByTickers = async (
  tickers: string[]
): Promise<TickerPriceSummary[]> => {
  const rows: TickerPriceSummary[] = [];
  for (const ticker of [...tickers].sort()) {
    const [latest] = await fetchDailyBarsDesc(ticker, 1);
    if (!latest) continue;
    const { change, changeRate } = changeFrom(latest.close, latest.basePrice);
    rows.push({
      ticker,
      close: latest.close,
      basePrice: latest.basePrice,
      change,
      changePct: changeRate,
      date: latest.date,
    });
  }
  return rows;
};

// 최근 13개월 일봉, ASC — 52주 창(12개월) + 1Y 수익률 기준일 여유.
const STATS_WINDOW_MONTHS = 13;

export const getPricesForStats = async (ticker: string): Promise<StockPriceSnapshot[]> => {
  const entry = await getDemoEntry(ticker);
  if (!entry) return [];
  const end = getDemoEodDate();
  const windowStart = format(subMonths(parseISO(end), STATS_WINDOW_MONTHS), "yyyy-MM-dd");
  const start = getDemoHistoryStart(entry);
  const from = windowStart > start ? windowStart : start;
  return generateDailyBars(ticker, entry.profile, from, end).map((bar) =>
    barToSnapshot(entry, bar)
  );
};

// 계산에 필요한 최소 필드만 요구 — 지수(IndexDailySnapshot) 등 다른 도메인 시계열도
// 구조적으로 그대로 투입 가능. 종목 호출부는 StockPriceSnapshot 이 상위 타입이므로 무영향.
export type PriceStatsInput = Pick<StockPriceSnapshot, "date" | "high" | "low" | "close">;

export const getPriceStats = (prices: PriceStatsInput[]): PriceStats => {
  if (prices.length === 0) {
    return {
      range52w: null,
      returns: [
        { period: "1M", value: null },
        { period: "3M", value: null },
        { period: "1Y", value: null },
      ],
    };
  }

  const last = prices[prices.length - 1];
  const current = last.close;
  const lastDate = parseISO(last.date);

  const oldestDate = prices[0].date;
  const cutoff1M = format(subMonths(lastDate, 1), "yyyy-MM-dd");
  const cutoff3M = format(subMonths(lastDate, 3), "yyyy-MM-dd");
  const cutoff1Y = format(subYears(lastDate, 1), "yyyy-MM-dd");

  // 52주 극값은 fetch 창(종목 13개월 / 지수 최대 1000일)이 아닌 실제 365일 창에서만 산출.
  // cutoff 는 오늘이 아니라 마지막 봉 date 기준 (결정적·테스트 용이).
  const range52wSource = prices.filter((p) => p.date >= cutoff1Y);
  const high52 = Math.max(...range52wSource.map((p) => p.high));
  const low52 = Math.min(...range52wSource.map((p) => p.low));
  const position = high52 === low52 ? 0 : (current - low52) / (high52 - low52);

  // 기간 시작일 이전 데이터가 없으면 폴백하지 않고 null 반환 (상장 1년 미만 종목 대응)
  const calcReturn = (cutoff: string): number | null => {
    if (oldestDate > cutoff) return null;
    const basis = prices.find((p) => p.date >= cutoff);
    if (basis === undefined) return null;
    return ((current - basis.close) / basis.close) * 100;
  };

  return {
    range52w: { high: high52, low: low52, current, position },
    returns: [
      { period: "1M", value: calcReturn(cutoff1M) },
      { period: "3M", value: calcReturn(cutoff3M) },
      { period: "1Y", value: calcReturn(cutoff1Y) },
    ],
  };
};
