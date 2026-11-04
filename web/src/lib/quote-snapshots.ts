import { cache } from "react";
import { getDailyBar } from "./demo-price-model";
import {
  getDemoEntry,
  getDemoEodDate,
  getDemoHistoryStart,
  type DemoUniverseEntry,
} from "./demo-universe";
import {
  getKrxLastCloseDate,
  type KrxSession,
  type QuoteMarket,
} from "@/shared/utils/market";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import type { PriceSign, StockQuote } from "@/shared/types/quote";

// 20:10 마감 스냅샷(UN/NX 통합 시세) 행 조립 + StockQuote 변환.
// 오프아워 세션(after_close/closed/preopen) quote 는 마감 스냅샷 행으로 서빙한다.
//
// (A) un_* 는 NXT 여부와 무관하게 서빙한다. KRX 애프터마켓(16:00~20:00) 은 전 종목이
//     대상이라 비NXT 종목의 un_close 도 20:00 애프터 종가다. nx_eligible 은 여기서 값을
//     거르는 축이 아니라 헤더 KRX/NXT 탭 토글·분봉 채널 선택(fetchNxEligible) 의 축.
//     단, 단건 NXT 탭(market=nxt) 은 nx_* 축으로 서빙한다 — UN 최종 체결이 KRX 애프터
//     마켓 쪽일 수 있어 un_close 가 NX 종가와 다를 수 있다.
// (B) StockQuote.open/high/low 는 스냅샷에 없어 0 로 채움. mergeLiveDayBar 의
//     isInvalidQuoteOhl 게이트(OHL 삼중 0)가 이미 존재하여 EOD 봉을 그대로 유지.

// 스냅샷 행. date 는 Date 객체.
type QuoteSnapshotRow = {
  ticker: string;
  date: Date;
  un_close: number;
  un_change: number;
  un_change_rate: number;
  un_volume: number;
  un_value: number | null;
  nx_eligible: boolean;
  nx_close: number | null;
  nx_volume: number | null;
};

const signOf = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

// 순수 변환 — UN 축. 리스트(multi) 경로는 이 축만 쓴다.
export const snapshotToQuote = (row: QuoteSnapshotRow): StockQuote => {
  return {
    ticker: row.ticker,
    price: row.un_close,
    change: row.un_change,
    changeRate: row.un_change_rate,
    sign: signOf(row.un_change),
    open: 0,
    high: 0,
    low: 0,
    volume: row.un_volume,
  };
};

// 순수 변환 — NX 축 (단건 NXT 탭 전용). NXT 미대상·nx_close 부재면 null → 호출측이 UN 축 유지.
// nx_change 컬럼이 없어 전일 종가(un_close − un_change) 대비로 재산출한다 — NX prdy_vrss 의
// 기준도 KRX 전일 종가라 산식이 일치.
export const snapshotToNxQuote = (row: QuoteSnapshotRow): StockQuote | null => {
  if (!row.nx_eligible || row.nx_close === null) return null;
  const prevClose = row.un_close - row.un_change;
  const change = row.nx_close - prevClose;
  return {
    ticker: row.ticker,
    price: row.nx_close,
    change,
    changeRate: prevClose === 0 ? 0 : (change / prevClose) * 100,
    sign: signOf(change),
    open: 0,
    high: 0,
    low: 0,
    volume: row.nx_volume ?? 0,
  };
};

// 대상 세션 판정 — 라이브 세션(regular/after/pre)은 현재가 경로(quote-source).
export const isSnapshotSession = (session: KrxSession | undefined): boolean =>
  session === "after_close" || session === "closed" || session === "preopen";

// 스냅샷 조회 키 축. 캡처본은 직전 정규장 마감 뒤 20:10 산출물이므로 "마지막 마감일"
// 이 조회 키다 — 응답 date/tradingDate 가 쓰는 거래일 축(getKrxTradingDate)과 별개.
export const getSnapshotLookupDate = (
  now: Date = new Date(),
  calendar?: MarketCalendar,
): string => getKrxLastCloseDate(now, calendar);

// ── 단건 fetch + 결정 ────────────────────────────────────────
export type SingleSnapshotDecision =
  | { kind: "serve"; quote: StockQuote | null } // hit 또는 부분 miss(= null)
  | { kind: "fallback" }; // 대상 세션 아님 or date 캡처 실패

// 순수 결정 함수 (테스트 용). row=undefined + dateExists=true 는 부분 miss.
// market=nxt 는 NX 축 우선, 없으면 UN 축 그대로 (비NXT 종목은 종전과 동일).
export const decideSingleSnapshot = (
  session: KrxSession | undefined,
  row: QuoteSnapshotRow | undefined,
  dateExists: boolean,
  market: QuoteMarket | null,
): SingleSnapshotDecision => {
  if (!isSnapshotSession(session)) return { kind: "fallback" };
  if (!dateExists) return { kind: "fallback" };
  if (!row) return { kind: "serve", quote: null };
  const nx = market === "nxt" ? snapshotToNxQuote(row) : null;
  return { kind: "serve", quote: nx ?? snapshotToQuote(row) };
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

// 조회 키 날짜의 20:00 마감 일봉에서 스냅샷 행을 조립. 상장 전 날짜는 행 부재(부분 miss).
// NX 축은 단일 경로라 UN 과 같은 값 — 비NXT 종목만 null.
const buildSnapshotRow = (
  entry: DemoUniverseEntry,
  date: string,
): QuoteSnapshotRow | undefined => {
  if (date < getDemoHistoryStart(entry)) return undefined;
  const bar = getDailyBar(entry.ticker, entry.profile, date);
  const basePrice = bar.basePrice ?? bar.regularClose;
  const change = bar.close - basePrice;
  const nx = entry.profile.nxEligible;
  return {
    ticker: entry.ticker,
    date: new Date(`${date}T00:00:00Z`),
    un_close: bar.close,
    un_change: change,
    un_change_rate: round2((change / basePrice) * 100),
    un_volume: bar.volume,
    un_value: bar.close * bar.volume,
    nx_eligible: nx,
    nx_close: nx ? bar.close : null,
    nx_volume: nx ? bar.volume : null,
  };
};

// 캡처본은 20:10 산출물 — 조회 키 날짜의 EOD 가 아직 없으면(거래일 20:10 전) 캡처 전.
const snapshotDateExists = (date: string, now: Date): boolean => date <= getDemoEodDate(now);

export const fetchQuoteSnapshot = async (
  ticker: string,
  now: Date,
  calendar?: MarketCalendar,
): Promise<{ row: QuoteSnapshotRow | undefined; dateExists: boolean }> => {
  const date = getSnapshotLookupDate(now, calendar);
  const dateExists = snapshotDateExists(date, now);
  if (!dateExists) return { row: undefined, dateExists };
  const entry = await getDemoEntry(ticker);
  return { row: entry ? buildSnapshotRow(entry, date) : undefined, dateExists };
};

// ── 복수 fetch + 결정 ────────────────────────────────────────
export type MultiSnapshotDecision =
  | { kind: "serve"; byTicker: Record<string, StockQuote | null> }
  | { kind: "fallback" };

export const decideMultiSnapshot = (
  session: KrxSession | undefined,
  tickers: string[],
  byTicker: Record<string, QuoteSnapshotRow>,
  dateExists: boolean,
): MultiSnapshotDecision => {
  if (!isSnapshotSession(session)) return { kind: "fallback" };
  if (!dateExists) return { kind: "fallback" };
  const out: Record<string, StockQuote | null> = {};
  for (const t of tickers) {
    const row = byTicker[t];
    out[t] = row ? snapshotToQuote(row) : null;
  }
  return { kind: "serve", byTicker: out };
};

// 미등록 종목·조회 실패 → null (안전 기본 = "판정 불가").
// React.cache 로 요청 단위 memo — 같은 요청 내 다중 소비자가 공유.
export const fetchNxEligible = cache(
  async (ticker: string): Promise<boolean | null> => {
    try {
      const entry = await getDemoEntry(ticker);
      return entry ? entry.profile.nxEligible : null;
    } catch {
      return null;
    }
  },
);

export const fetchQuoteSnapshots = async (
  tickers: string[],
  now: Date,
  calendar?: MarketCalendar,
): Promise<{
  byTicker: Record<string, QuoteSnapshotRow>;
  dateExists: boolean;
}> => {
  if (tickers.length === 0) {
    // 빈 요청. dateExists 는 상관없음 → false 로 두고 route 가 자연스레 skip.
    return { byTicker: {}, dateExists: false };
  }
  const date = getSnapshotLookupDate(now, calendar);
  const dateExists = snapshotDateExists(date, now);
  const byTicker: Record<string, QuoteSnapshotRow> = {};
  if (!dateExists) return { byTicker, dateExists };
  for (const ticker of tickers) {
    const entry = await getDemoEntry(ticker);
    const row = entry ? buildSnapshotRow(entry, date) : undefined;
    if (row) byTicker[ticker] = row;
  }
  return { byTicker, dateExists };
};
