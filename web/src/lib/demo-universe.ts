import { cache } from "react";
import { pool } from "./db";
import {
  getTickerProfile,
  listTradingDates,
  type DemoPin,
  type TickerProfile,
} from "./demo-price-model";
import { isRowBasisMismatch } from "./financials";
import { getKstDateAndMinutes, getPreviousKrxTradingDate } from "@/shared/utils/market";

// 가상 시세 생성기의 종목 입력(앵커 재무 · 배당 핀 · shares · 상장일)을 DB 에서 한 번에 읽어
// 종목당 프로필 하나로 메모한다. 핀 종목의 프로필은 마지막 핀부터 앵커까지 ~200일 워크를
// 포함하므로 요청마다 다시 만들지 않는다. 가격 테이블은 읽지 않는다 — 가격은 전부 생성기 산출.

export type DemoUniverseEntry = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  shares: number | null;
  listedAt: string | null; // 'YYYY-MM-DD'
  profile: TickerProfile;
};

// 일봉 시작. 상장일이 더 늦으면 상장일.
export const DEMO_HISTORY_START = "2016-01-01";

type StockRow = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  shares: number | null;
  listed_at: string | null;
};

// 연간 재무 행과 보통주 배당 행을 (ticker, year) 로 맞춘 행. 한쪽만 있는 해는 다른 쪽이 null.
type YearlyRow = {
  ticker: string;
  year: number;
  has_financial: boolean;
  eps: number | null;
  bps: number | null;
  net_income: number | null;
  dps: number | null;
  dart_yield: number | null;
};

const STOCKS_SQL =
  "SELECT ticker, name, market, shares, to_char(listed_at, 'YYYY-MM-DD') AS listed_at FROM stocks WHERE is_active = true";

const YEARLY_SQL = `SELECT COALESCE(f.ticker, d.ticker) AS ticker,
       COALESCE(f.year, d.year) AS year,
       (f.ticker IS NOT NULL) AS has_financial,
       f.eps, f.bps, f.net_income, d.dps, d.dart_yield
  FROM (SELECT ticker, year, eps, bps, net_income FROM financial_statements WHERE report_type = 'annual') f
  FULL OUTER JOIN (SELECT ticker, year, dps, dart_yield FROM dividends WHERE stock_kind = 'common') d
    ON d.ticker = f.ticker AND d.year = f.year`;

const UNIVERSE_TTL_MS = 3600 * 1000;

const toShares = (raw: number | null): number | null =>
  raw !== null && Number(raw) > 0 ? Number(raw) : null;

// 결산일 실제 주가 수준 = DPS ÷ 시가배당률. 그 해의 EPS 기준 주식수가 현재와 다르면(병합·분할)
// DPS 도 같은 주식수 기준이라 핀으로 쓰지 않는다 — 재무 슬레이트의 판정과 같은 기준.
const toPins = (ticker: string, rows: readonly YearlyRow[], shares: number | null): DemoPin[] =>
  rows
    .filter((row) => (row.dps ?? 0) > 0 && (row.dart_yield ?? 0) > 0)
    .filter(
      (row) =>
        !isRowBasisMismatch(
          {
            ticker,
            year: row.year,
            quarter: null,
            report_type: "annual",
            net_income: row.net_income,
            eps: row.eps,
          },
          shares,
        ),
    )
    .map((row) => ({
      date: `${row.year}-12-31`,
      price: (row.dps as number) / ((row.dart_yield as number) / 100),
    }));

// export 는 테스트용 (fixture 행으로 조립 검증).
export const buildDemoUniverse = (
  stocks: readonly StockRow[],
  yearly: readonly YearlyRow[],
): DemoUniverseEntry[] => {
  const yearlyByTicker = new Map<string, YearlyRow[]>();
  for (const row of yearly) {
    const bucket = yearlyByTicker.get(row.ticker) ?? [];
    bucket.push(row);
    yearlyByTicker.set(row.ticker, bucket);
  }
  return stocks.map((stock) => {
    const rows = (yearlyByTicker.get(stock.ticker) ?? []).sort((a, b) => a.year - b.year);
    const shares = toShares(stock.shares);
    const latest = rows.filter((row) => row.has_financial).at(-1);
    const profile = getTickerProfile(stock.ticker, {
      eps: latest?.eps ?? null,
      bps: latest?.bps ?? null,
      pins: toPins(stock.ticker, rows, shares),
    });
    return {
      ticker: stock.ticker,
      name: stock.name,
      market: stock.market,
      shares,
      listedAt: stock.listed_at,
      profile,
    };
  });
};

type UniverseMemo = {
  entries: DemoUniverseEntry[];
  byTicker: Map<string, DemoUniverseEntry>;
  expiresAt: number;
};

// 모듈 메모(값 + 만료). 적재 중 동시 요청은 같은 promise 를 기다린다 — 콜드 스타트에 2,700 종목
// 프로필을 요청 수만큼 만들지 않는다. 실패는 throw — 호출 측 기존 에러 경로를 탄다.
let memo: UniverseMemo | null = null;
let pending: Promise<UniverseMemo> | null = null;

const loadUniverse = async (): Promise<UniverseMemo> => {
  const [[stocks], [yearly]] = await Promise.all([
    pool.query<StockRow[]>(STOCKS_SQL),
    pool.query<YearlyRow[]>(YEARLY_SQL),
  ]);
  const entries = buildDemoUniverse(stocks, yearly);
  return {
    entries,
    byTicker: new Map(entries.map((entry) => [entry.ticker, entry])),
    expiresAt: Date.now() + UNIVERSE_TTL_MS,
  };
};

const getUniverseMemo = cache(async (): Promise<UniverseMemo> => {
  if (memo && memo.expiresAt > Date.now()) return memo;
  if (!pending) {
    pending = loadUniverse()
      .then((loaded) => {
        memo = loaded;
        return loaded;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
});

export const getDemoUniverse = async (): Promise<DemoUniverseEntry[]> =>
  (await getUniverseMemo()).entries;

export const getDemoEntry = async (ticker: string): Promise<DemoUniverseEntry | null> =>
  (await getUniverseMemo()).byTicker.get(ticker) ?? null;

export const getDemoHistoryStart = (entry: DemoUniverseEntry): string =>
  entry.listedAt !== null && entry.listedAt > DEMO_HISTORY_START
    ? entry.listedAt
    : DEMO_HISTORY_START;

// EOD 일봉이 존재하는 마지막 거래일. "오늘" 봉은 20:00 애프터마켓 마감 뒤 EOD 적재 시각(20:10)
// 부터 존재한다 — 그 전엔 전 거래일까지만. 장중 당일 봉은 클라가 live quote 로 얹는다.
const EOD_READY_MINUTES = 20 * 60 + 10;

export const getDemoEodDate = (now: Date = new Date()): string => {
  const { date, minutes } = getKstDateAndMinutes(now);
  const isTradingDay = listTradingDates(date, date).length === 1;
  if (isTradingDay && minutes >= EOD_READY_MINUTES) return date;
  return getPreviousKrxTradingDate(date);
};
