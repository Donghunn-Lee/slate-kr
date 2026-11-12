import { cache } from "react";
import { generateIndexDailyBars, indexIntradayBarsAt } from "@/lib/demo/index-model";
import { DEMO_HISTORY_START, getDemoEodDate } from "@/lib/demo/universe";
import { fetchOverseasIndexIntradayChart } from "./overseas-index-source";
import {
  getIndexMeta,
  INDEX_CODES,
  type DomesticIndexCode,
  type IndexCode,
  type OverseasIndexCode,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import {
  getOverseasIndexSessionState,
  getOverseasIndexTradingDate,
  getPreviousOverseasIndexTradingDate,
} from "@/shared/utils/market";
import type { ChartBar, IndexDailySnapshot, IndexIntradaySnapshot } from "@/shared/types/quote";

// 국내 지수 시세 코드 — index-quotes route 가 이 코드로 현재가를 요청한다. 코드 ↔ 지수의 단일 소스.
export const ISCD_BY_INDEX: Record<DomesticIndexCode, string> = {
  KOSPI: "0001",
  KOSDAQ: "1001",
  KOSPI200: "2001",
  KOSDAQ150: "3003",
};

const isIndexCode = (raw: string): raw is IndexCode =>
  (INDEX_CODES as readonly string[]).includes(raw);

// 지수 EOD 가 존재하는 마지막 거래일. 국내는 종목과 같은 20:10 EOD 축, 해외는 거래소 로컬
// 세션이 마감된 날(장중이면 직전 거래일).
const lastIndexEodDate = (code: IndexCode, now: Date): string => {
  if (getIndexMeta(code).region === "domestic") return getDemoEodDate(now);
  const overseas = code as OverseasIndexCode;
  const tradingDate = getOverseasIndexTradingDate(overseas, now);
  return getOverseasIndexSessionState(overseas, now) === "regular"
    ? getPreviousOverseasIndexTradingDate(overseas, tradingDate)
    : tradingDate;
};

export const getLatestIndexPrice = cache(
  async (indexCode: string): Promise<IndexDailySnapshot | null> => {
    const bars = await getIndexDailyPrices(indexCode, 1);
    return bars[0] ?? null;
  }
);

// fake-UTC epoch sec (KST/ET 벽시계를 UTC 로 위장) → 원본 캘린더 YYYY-MM-DD.
// getUTC* 로 위장 컴포넌트를 그대로 복원.
const sessionDateFromTimestamp = (sec: number): string => {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// useBarVolume=false: 해외 지수 분봉은 거래량 없이 그린다 — 강제 0.
// useBarVolume=true: 봉의 volume 을 그대로 전달 (histogram 오버레이).
export const toIntradaySnapshots = (
  indexCode: string,
  bars: ChartBar[],
  prevClose: number,
  useBarVolume: boolean = false
): IndexIntradaySnapshot[] =>
  bars.map((bar) => {
    const change = prevClose > 0 ? bar.close - prevClose : 0;
    const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      indexCode,
      timestamp: bar.time as number,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      change,
      changeRate,
      volume: useBarVolume ? (bar.volume ?? 0) : 0,
    };
  });

// ── 해외지수 intraday (US 3종 + 아시아 3종 + DAX) ─────────────────
// 서버는 START 라벨 1분 봉을 반환하고 END/리샘플은 클라 소관(국내와 동형).
// 반환: null — 분봉이 없는 지수 / [] 또는 배열 — 정상.
// tradingDate 는 route 캐시 키 축이라 시그니처에 남는다 — 봉의 세션은 지금 시각이 정한다.
export const getOverseasIndexIntradayPrices = async (
  indexCode: OverseasIntradayCode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tradingDate: string
): Promise<IndexIntradaySnapshot[] | null> => {
  const bars = await fetchOverseasIndexIntradayChart(indexCode);
  if (bars === null) return null;
  if (bars.length === 0) return [];
  // change 축 = 화면에 그릴 세션(마지막 봉의 거래일) 의 전일 일봉 종가.
  const sessionDate = sessionDateFromTimestamp(bars[bars.length - 1].time as number);
  const prevDate = getPreviousOverseasIndexTradingDate(indexCode, sessionDate);
  const prevClose = generateIndexDailyBars(indexCode, prevDate, prevDate)[0]?.close ?? 0;
  return toIntradaySnapshots(indexCode, bars, prevClose);
};

// ── 국내 지수 1분 ─────────────────
// 직전 거래일 전체 + 오늘(지금까지). 각 봉의 change 는 그 봉 거래일의 전일 일봉 종가 대비 —
// 현재가(indexQuoteAt) 와 같은 축이라 헤더 = 분봉 마지막 봉.
export const getIndexIntradayPrices = async (
  indexCode: DomesticIndexCode,
  now: Date = new Date()
): Promise<IndexIntradaySnapshot[] | null> => indexIntradayBarsAt(indexCode, now);

export const getIndexDailyPrices = async (
  indexCode: string,
  limit?: number
): Promise<IndexDailySnapshot[]> => {
  if (!isIndexCode(indexCode)) return [];
  // limit 생략 = 전량. 기본값을 두면 잊고 잘라올 위험이 있어 옵셔널로. 최신 N건, ASC.
  const bars = generateIndexDailyBars(
    indexCode,
    DEMO_HISTORY_START,
    lastIndexEodDate(indexCode, new Date())
  );
  return limit === undefined ? bars : bars.slice(Math.max(0, bars.length - limit));
};
