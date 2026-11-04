import type {
  ChartBar,
  IndexQuote,
  MarketActionStatus,
  StockQuote,
} from "@/shared/types/quote";
import { INDEX_LABEL, type DomesticIndexCode } from "@/shared/constants/indices";
import { dateToKstStartSec } from "@/shared/utils/dateToKstStartSec";
import {
  getKrxSessionState,
  getKrxTradingDate,
  getKstDateAndMinutes,
  getPreviousKrxTradingDate,
  isKrxEarlyPreopen,
  isKrxLatePreopen,
} from "@/shared/utils/market";
import { indexQuoteAt } from "./demo-index-model";
import {
  generateDailyBars,
  generateIntradayBars,
  quoteAt,
  type DemoChannel,
  type DemoMinuteBar,
  type TickerProfile,
} from "./demo-price-model";
import { getDemoEntry } from "./demo-universe";
import { ISCD_BY_INDEX } from "./indices";

// 종목 · 국내 지수의 현재가와 종목 분봉 — 전부 생성기 산출. route 가 넘기는 시장 채널
// ("J" | "NX" | "UN") 과 지수 코드("0001" 등)는 그대로 받아 안에서 대응한다.
// 실패는 universe 조회(DB) 실패와 미등록 ticker 둘뿐 — 각각 throw · null.

const MULTI_QUOTE_LIMIT = 30; // 멀티 시세 1회 상한 — route 가 같은 값으로 자른다

// marketDiv:
//   - fetchMultiQuote (watchlist ranking) 는 UN(KRX+NXT 통합) 고정 — 배지 시그널이
//     없어 통합 vol 유지가 이득.
//   - fetchStockQuote (종목 상세 헤더) 는 route 가 세션·탭별로 J/NX/UN 을 고른다 —
//     pre·오프아워의 isNxtMiss 판정이 NX 채널의 null(비NXT 종목) 경로에 의존하므로
//     그 세션들은 UN 으로 통합하지 않는다.
const MARKET_DIV_INTEGRATED = "UN";

type QuoteMarketDiv = "J" | "NX" | typeof MARKET_DIV_INTEGRATED;

export const fetchStockQuote = async (
  ticker: string,
  marketDiv: QuoteMarketDiv,
): Promise<StockQuote | null> => {
  const entry = await getDemoEntry(ticker);
  if (!entry) return null;
  return quoteAt(ticker, entry.profile, new Date(), marketDiv);
};

// 시장조치(거래정지 · 관리종목 등)는 가상 시세에 없다 — 배지 슬롯은 항상 비운다.
export const fetchStockMarketAction = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ticker: string,
): Promise<MarketActionStatus | null> => null;

export type MultiQuoteResult = {
  quotes: Record<string, StockQuote | null>;
  // per-code 실패 신호. 미등록 ticker 만 true — 소비측이 종목별 배지로 분기한다.
  failed: Record<string, boolean>;
};

// 입력 tickers 전체를 키로 갖는 Record 반환. 미등록 ticker 는 quote=null, failed=true.
export const fetchMultiQuote = async (tickers: string[]): Promise<MultiQuoteResult> => {
  if (tickers.length === 0) return { quotes: {}, failed: {} };

  let effective = tickers;
  if (tickers.length > MULTI_QUOTE_LIMIT) {
    console.warn(
      `[quote-source] multi quote input ${tickers.length} exceeds limit ${MULTI_QUOTE_LIMIT}, truncating`,
    );
    effective = tickers.slice(0, MULTI_QUOTE_LIMIT);
  }

  const now = new Date();
  const quotes: Record<string, StockQuote | null> = {};
  const failed: Record<string, boolean> = {};
  for (const ticker of effective) {
    const entry = await getDemoEntry(ticker);
    const quote = entry ? quoteAt(ticker, entry.profile, now, MARKET_DIV_INTEGRATED) : null;
    quotes[ticker] = quote;
    failed[ticker] = entry === null;
  }
  return { quotes, failed };
};

// ── 국내 지수 현재가 ─────────────────
const INDEX_BY_ISCD = new Map<string, DomesticIndexCode>(
  (Object.entries(ISCD_BY_INDEX) as [DomesticIndexCode, string][]).map(([code, iscd]) => [
    iscd,
    code,
  ]),
);

export const fetchIndexQuote = async (iscd: string): Promise<IndexQuote | null> => {
  const code = INDEX_BY_ISCD.get(iscd);
  if (!code) return null;
  return indexQuoteAt(code, INDEX_LABEL[code], new Date());
};

// ── 종목 분봉 ─────────────────
const MINUTE_SEC = 60;
const PREVIOUS_DAY_TAIL_BARS = 30;

const toChartBar = (bar: DemoMinuteBar): ChartBar => ({
  time: bar.timestamp,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
});

// 하루 전체 분봉(START 라벨 fake-UTC 초). NXT 취급 종목은 UN(08:00~20:00), 그 외는 J(09:00~15:30
// + 16:00~20:00) — 채널이 세션 창을 정한다.
const dayBars = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  channel: DemoChannel,
): ChartBar[] => {
  const [prev, today] = generateDailyBars(ticker, profile, getPreviousKrxTradingDate(date), date);
  return (generateIntradayBars(ticker, profile, date, prev, today, channel) ?? []).map(toChartBar);
};

export type StockIntradayChartResult = {
  bars: ChartBar[];
  tradingDate: string; // 'YYYY-MM-DD' — bars 가 실제로 속한 KST 거래일
  previousDay: boolean; // true = 전일 스냅샷 fallback (오늘 봉 부재)
  failed: boolean; // 생성기 경로에는 결손이 없어 항상 false — 응답 계약 유지용
};

// 종목 분봉 차트.
// - 활성 세션 (pre / regular / after) + latePreopen (08:50~09:00): 오늘 봉(지금까지) 앞에 전일
//   tail 30봉 prepend (연속 컨텍스트). tradingDate = 오늘. 비NXT pre / latePreopen 은 오늘 봉이
//   없어 tail 만 반환.
// - after_close (20:00~06:00): 오늘 확장 세션 완결본 전체 (tail 불필요).
// - 아침 프리오픈 (06:00~08:00) · closed (주말·공휴일): 직전 완결 거래일 전체 + previousDay.
// null 은 미등록 ticker 뿐. now 주입 가능 — 로컬 테스트용.
export const fetchStockIntradayChart = async (
  ticker: string,
  now: Date = new Date(),
): Promise<StockIntradayChartResult | null> => {
  const entry = await getDemoEntry(ticker);
  if (!entry) return null;
  const { profile } = entry;
  const channel: DemoChannel = profile.nxEligible ? "UN" : "J";

  const session = getKrxSessionState(now);
  // 거래일 08:00 이후면 오늘, 아니면 직전 거래일 — 아침 프리오픈 · closed 는 이미 직전 거래일.
  const tradingDate = getKrxTradingDate(now);

  if (isKrxEarlyPreopen(now) || session === "closed") {
    return {
      bars: dayBars(ticker, profile, tradingDate, channel),
      tradingDate,
      previousDay: true,
      failed: false,
    };
  }

  const isActiveOrLatePreopen =
    session === "pre" || session === "regular" || session === "after" || isKrxLatePreopen(now);
  const today = dayBars(ticker, profile, tradingDate, channel);
  if (!isActiveOrLatePreopen) {
    return { bars: today, tradingDate, previousDay: false, failed: false };
  }

  const { minutes } = getKstDateAndMinutes(now);
  const cutoffSec = dateToKstStartSec(tradingDate) + minutes * MINUTE_SEC;
  const upToNow = today.filter((bar) => (bar.time as number) <= cutoffSec);
  const tail = dayBars(
    ticker,
    profile,
    getPreviousKrxTradingDate(tradingDate),
    channel,
  ).slice(-PREVIOUS_DAY_TAIL_BARS);
  return { bars: [...tail, ...upToNow], tradingDate, previousDay: false, failed: false };
};
