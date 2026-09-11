import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import {
  normalizeIndexQuote,
  normalizeMultiQuote,
  normalizeStockQuote,
  parseMarketAction,
} from "@/lib/kis-quote";
import type {
  ChartBar,
  IndexQuote,
  MarketActionStatus,
  StockQuote,
} from "@/shared/types/quote";
import {
  isDomesticSessionGapFill,
  isSentinelBar,
} from "@/shared/utils/intradaySentinel";
import {
  getKrxSessionState,
  getKrxTradingDate,
  getKstDateAndMinutes,
  getPreviousKrxTradingDate,
  isKrxActiveSession,
  isKrxEarlyPreopen,
  isKrxLatePreopen,
} from "@/shared/utils/market";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import { getMarketCalendar } from "@/lib/marketCalendar";
import { fetchNxEligible } from "@/lib/quoteSnapshots";
import {
  buildMinuteSlots,
  densifyIntradayBars,
} from "@/lib/densifyIntradayBars";
import { mergeChartBars } from "@/shared/utils/toEndLabelBars";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INDEX_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-index-price";
const INDEX_INTRADAY_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice";
const STOCK_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
// FHKST03010230 (주식일별분봉조회) — date 파라미터 지원. 120봉/콜, 페이지네이션 없음.
// 당일·전일 모두 이 TR 하나로 조회한다. 당일 전용 TR(FHKST03010200) 을 쓰지 않는 이유:
// 30봉/콜이라 하루 커버에 ≤25콜 burst 가 필요해 KIS 20/s 를 넘기 쉽고, 저유동 종목에선
// 마지막 실체결을 현재 분으로 옮긴 허구 봉을 반환한다(HTS 대조 실측).
const STOCK_DAILY_MINUTE_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice";
const MULTI_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice";
const TR_ID_INDEX_PRICE = "FHPUP02100000";
const TR_ID_INDEX_INTRADAY = "FHKUP03500200";
const TR_ID_STOCK_PRICE = "FHKST01010100";
const TR_ID_STOCK_DAILY_MINUTE = "FHKST03010230";
const TR_ID_MULTI_PRICE = "FHKST11300006";
const MULTI_QUOTE_LIMIT = 30; // KIS 공식 상한

// 종목 1분봉 fan-out anchors (FHKST03010230). 당일 라이브와 전일 스냅샷(closed·아침
// 프리오픈) 이 같은 세트를 쓴다 — 하루 커버 조건이 날짜와 무관하기 때문. anchor 는
// 상한(포함) — 그 이전 실체결 120봉을 반환하고, 미래 anchor 는 now 로 클램프된다. 실체결
// 120봉은 항상 ≥120분을 덮으므로 anchor 간격 ≤120분이면 유동성과 무관하게 결손이 없다.
// NXT 거래가능 종목은 UN 으로 08:00~20:00, 비NXT 종목은 J 로 09:00~15:30 정규장만.
// eligibility 는 quote_snapshots.nx_eligible 로 판정.
// 첫 anchor "100000" 이 창 시작을 덮는 근거 — 비NXT 는 09:00 이전 봉이 없어 61분,
// NXT 는 (08:00, 10:00] 121분 중 08:50~08:59 가 무체결 갭이라 실체결 ≤111봉.
// 첫 anchor 를 더 늦게 잡으면 안 되는 이유: 유동 종목은 120봉이 정확히 120분이라 11:00
// anchor 는 09:01~11:00 만 돌려주고 09:00 개장 봉이 빠진다.
type MinuteMarketDiv = "J" | "UN";
export const STOCK_INTRADAY_ANCHORS_NXT: readonly string[] = [
  "100000",
  "120000",
  "140000",
  "160000",
  "180000",
  "200000",
] as const;
export const STOCK_INTRADAY_ANCHORS_REGULAR: readonly string[] = [
  "100000",
  "120000",
  "140000",
  "153000",
] as const;
// 분 슬롯 — 무체결 분을 fill 봉으로 채울 대상 (densifyIntradayBars). 세션 경계를 여기서
// 따로 적지 않는다: 각 분의 세션은 getKrxSessionState(NXT 는 pre/regular/after, 비NXT 는
// regular), 갭 창 제외는 isDomesticSessionGapFill 이 각각 단일 소스.
// 슬롯은 정의상 무체결 분이라 vol 0 으로 갭 창 판정을 묻는다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;

// tradingDate(YYYY-MM-DD) 의 00:00~endMin 중 슬롯인 분 (fake-UTC 초). 테스트 전용 export.
export const buildDaySlots = (
  tradingDate: string,
  endMin: number,
  isNxt: boolean,
  calendar: MarketCalendar,
): number[] => {
  const dayStartSec = kstToFakeUtcSec(toKisDate(tradingDate), "000000");
  return buildMinuteSlots(
    dayStartSec,
    dayStartSec + endMin * 60,
    (hhmmss, slotSec) => {
      const session = getKrxSessionState(
        new Date(slotSec * 1000 - KST_OFFSET_MS),
        calendar,
      );
      const inSession = isNxt
        ? isKrxActiveSession(session)
        : session === "regular";
      return !inSession || isDomesticSessionGapFill(hhmmss, 0);
    },
  );
};

// anchor 세트 셀렉터 — NXT 여부로 선택. 당일 fan-out · 전일 스냅샷 공용. 테스트 전용 export.
export const getStockIntradayAnchors = (isNxt: boolean): readonly string[] =>
  isNxt ? STOCK_INTRADAY_ANCHORS_NXT : STOCK_INTRADAY_ANCHORS_REGULAR;

// closed fallback 마켓코드 셀렉터. 테스트 전용 export.
export const getClosedFallbackMarketDiv = (isNxt: boolean): MinuteMarketDiv =>
  isNxt ? "UN" : "J";

// YYYY-MM-DD → YYYYMMDD. KIS FID_INPUT_DATE_1 파라미터 포맷.
export const toKisDate = (yyyyMmDd: string): string => yyyyMmDd.replace(/-/g, "");

// 라이브 · closed 경로 공용 병합: anchor 간 time 중복 제거 후 ASC 정렬.
export const mergeAndSortIntradayBars = (
  results: readonly (readonly ChartBar[] | null)[],
): ChartBar[] => {
  const merged = new Map<number, ChartBar>();
  for (const rows of results) {
    if (!rows) continue;
    for (const bar of rows) {
      if (typeof bar.time === "number") merged.set(bar.time, bar);
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
};

const anchorToMinutes = (a: string): number =>
  Number(a.slice(0, 2)) * 60 + Number(a.slice(2, 4));

const INDEX_NAME_BY_ISCD: Record<string, string> = {
  "0001": "코스피",
  "1001": "코스닥",
  "2001": "코스피200",
  "3003": "코스닥150",
};

const KisResponseSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output: z.unknown(),
});

// 인트라데이 차트는 output2 배열로 응답. output1(요약)은 사용하지 않음.
// cntg_vol: 해당 분봉의 거래량(지수 편입 종목의 합산). histogram 오버레이용.
const KisIntradayResponseSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output2: z
    .array(
      z.object({
        stck_bsop_date: z.string(), // YYYYMMDD
        stck_cntg_hour: z.string(), // HHMMSS (마커: 999999/888888)
        bstp_nmix_prpr: z.coerce.number(), // 종가
        bstp_nmix_oprc: z.coerce.number(),
        bstp_nmix_hgpr: z.coerce.number(),
        bstp_nmix_lwpr: z.coerce.number(),
        cntg_vol: z.coerce.number(),
      }),
    )
    .optional()
    .default([]),
});

// 종목 분봉 응답. 지수와 필드명이 다르다 (stck_* 접두, prpr=현재/종가).
// cntg_vol: 해당 분봉의 체결량. histogram 오버레이용.
const KisStockMinuteResponseSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output2: z
    .array(
      z.object({
        stck_bsop_date: z.string(),
        stck_cntg_hour: z.string(),
        stck_prpr: z.coerce.number(),
        stck_oprc: z.coerce.number(),
        stck_hgpr: z.coerce.number(),
        stck_lwpr: z.coerce.number(),
        cntg_vol: z.coerce.number(),
      }),
    )
    .optional()
    .default([]),
});

export type IndexIntradayBar = {
  timestamp: number; // KST를 UTC로 위장한 epoch 초
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const INTRADAY_MARKERS = new Set(["999999", "888888"]);

// KST 시각을 그대로 UTC로 간주하고 epoch 초로 변환. lightweight-charts가 UTC 기준으로
// 가로축을 표시하므로 이 위장이 가장 적은 비용으로 "10:30 KST"를 화면에 "10:30"으로 보여준다.
export const kstToFakeUtcSec = (yyyymmdd: string, hhmmss: string): number =>
  Math.floor(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
      Number(hhmmss.slice(0, 2)),
      Number(hhmmss.slice(2, 4)),
      Number(hhmmss.slice(4, 6)),
    ) / 1000,
  );

// 종목 분봉 응답 row 순수 타입 (Zod 파싱 후). parseDailyMinuteRows 입력에 사용.
type StockMinuteRow = {
  stck_bsop_date: string;
  stck_cntg_hour: string;
  stck_prpr: number;
  stck_oprc: number;
  stck_hgpr: number;
  stck_lwpr: number;
  cntg_vol: number;
};

// closed fallback 응답 → ChartBar[] 정규화. 순수 함수 — 테스트 대상.
// (1) 마커 hour (999999/888888) 제거
// (2) stck_bsop_date === target 필터 (저유동성 종목 anchor bleed 방어, #099-2 실측)
// (3) 세션 갭 fill 봉 제거 (KIS 응답이 세션 갭 구간을 O=H=L=C+vol=0 으로 채움)
// (4) row → ChartBar (KST → fake-UTC 초)
// (5) sentinel 필터 (OHL=0 · vol<0)
export const parseDailyMinuteRows = (
  rows: readonly StockMinuteRow[],
  targetDateYyyymmdd: string,
): ChartBar[] =>
  rows
    .filter((r) => !INTRADAY_MARKERS.has(r.stck_cntg_hour))
    .filter((r) => r.stck_bsop_date === targetDateYyyymmdd)
    .filter((r) => !isDomesticSessionGapFill(r.stck_cntg_hour, r.cntg_vol))
    .map((r) => ({
      time: kstToFakeUtcSec(r.stck_bsop_date, r.stck_cntg_hour),
      open: r.stck_oprc,
      high: r.stck_hgpr,
      low: r.stck_lwpr,
      close: r.stck_prpr,
      volume: r.cntg_vol,
    }))
    .filter((b) => !isSentinelBar(b));

type IndexMinuteRow = {
  stck_bsop_date: string;
  stck_cntg_hour: string;
  bstp_nmix_prpr: number;
  bstp_nmix_oprc: number;
  bstp_nmix_hgpr: number;
  bstp_nmix_lwpr: number;
  cntg_vol: number;
};

// 지수 마감 후 확정 재계산 프린트 접기 — HHMMSS > closeBoundary 인 raw 봉을
// 그 봉 날짜의 closeBoundary 봉에 흡수(open=선행, close=후행, H/L 극값, vol 합).
//
// KIS 발행 규칙(KOSPI/KOSDAQ 실측): 15:30 마감 봉 이후 15:31·15:32 프린트가 나오며
// 공식 종가는 15:32 프린트에만 확정값으로 담긴다(15:30 raw close 는 소수점 최종 반올림
// 이전 값이라 어긋난다). 병합 결과 15:30 봉이 close=15:32 값을 상속하고 vol 은 세 행 합.
//
// KOSPI200/KOSDAQ150 처럼 15:31+ 프린트가 없는 케이스는 no-op.
// 해외 지수도 마감 후 프린트가 발생하므로 closeBoundary(HHMMSS)를 지수별 마감
// 시각으로 호출측에서 명시 전달한다. 경계 판정은 봉 시각의 getUTC* 컴포넌트로
// 수행 — wall-clock 인코딩(fake-UTC epoch)에 그대로 성립.
// 순서 유지 (입력 ASC 라면 병합 후에도 배열 인덱스 순서 = ASC).
export const foldPostCloseIndexBars = (
  bars: readonly ChartBar[],
  closeBoundary: string,
): ChartBar[] => {
  const hh = Number(closeBoundary.slice(0, 2));
  const mm = Number(closeBoundary.slice(2, 4));
  const ss = Number(closeBoundary.slice(4, 6));
  const closeSecFromBar = (barSec: number): number => {
    const d = new Date(barSec * 1000);
    return Math.floor(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, ss) /
        1000,
    );
  };
  const buckets = new Map<number, ChartBar>();
  const stringTimeBars: ChartBar[] = [];
  const orderKey: (number | string)[] = [];
  for (const b of bars) {
    if (typeof b.time !== "number") {
      stringTimeBars.push(b);
      orderKey.push(`s${stringTimeBars.length - 1}`);
      continue;
    }
    const closeSec = closeSecFromBar(b.time);
    const key = b.time > closeSec ? closeSec : b.time;
    const existing = buckets.get(key);
    const incoming: ChartBar = { ...b, time: key };
    if (existing) {
      buckets.set(key, mergeChartBars(existing, incoming, key));
    } else {
      buckets.set(key, incoming);
      orderKey.push(key);
    }
  }
  return orderKey.map((k) => {
    if (typeof k === "string") return stringTimeBars[Number(k.slice(1))];
    return buckets.get(k) as ChartBar;
  });
};

// targetDateYyyymmdd = null 이면 date 필터 스킵 — 라이브 경로는 KIS 응답이 자연스레
// 최근 세션 위주라 소비측 filter 로 충분. non-null 이면 stck_bsop_date === target
// 필터로 bleed(응답이 target 전후일 봉도 함께 반환) 방어.
export const parseIndexMinuteRows = (
  rows: readonly IndexMinuteRow[],
  targetDateYyyymmdd: string | null,
): IndexIntradayBar[] => {
  const base = rows.filter((r) => !INTRADAY_MARKERS.has(r.stck_cntg_hour));
  const dateFiltered =
    targetDateYyyymmdd === null
      ? base
      : base.filter((r) => r.stck_bsop_date === targetDateYyyymmdd);
  return dateFiltered
    .map((r) => ({
      timestamp: kstToFakeUtcSec(r.stck_bsop_date, r.stck_cntg_hour),
      open: r.bstp_nmix_oprc,
      high: r.bstp_nmix_hgpr,
      low: r.bstp_nmix_lwpr,
      close: r.bstp_nmix_prpr,
      volume: r.cntg_vol,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
};

// IndexIntradayBar ↔ ChartBar — timestamp/time 키 차이 외 동일.
const indexBarsToChartBars = (bars: readonly IndexIntradayBar[]): ChartBar[] =>
  bars.map((b) => ({
    time: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

// START 라벨 ChartBar[] 반환. fold/END 는 서빙 층 소관.
// targetDate 는 두 축으로 쓰인다:
//   · URL `FID_INPUT_DATE_1` — session === "closed" 일 때만 전달. active 세션에서
//     이 파라미터를 보내면 collector 와 다른 호출 형태가 되어 검증된 경로 밖으로 나간다.
//   · `parseIndexMinuteRows` 필터 — non-null 이면 항상 stck_bsop_date 필터.
//     active 세션에서 URL 파라미터 없이 호출해도 세션 경계에서 어제 봉이 섞이는 회귀 차단.
// null = 자격/HTTP/파싱/rt_cd 실패, [] = 응답 정상 empty.
export const fetchIndexMinuteBarsRaw = async (
  iscd: string,
  now: Date,
  intervalSec: number,
  targetDate: string | null,
): Promise<ChartBar[] | null> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for index intraday");
    return null;
  }

  const url = new URL(BASE_URL + INDEX_INTRADAY_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "U");
  url.searchParams.set("FID_INPUT_ISCD", iscd);
  url.searchParams.set("FID_INPUT_HOUR_1", String(intervalSec));
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
  url.searchParams.set("FID_ETC_CLS_CODE", "0");
  const calendar = await getMarketCalendar();
  const urlDate =
    targetDate !== null && getKrxSessionState(now, calendar) === "closed"
      ? targetDate
      : null;
  if (urlDate !== null) {
    url.searchParams.set("FID_INPUT_DATE_1", urlDate);
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_INDEX_INTRADAY,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis] index intraday HTTP ${res.status}`);
      return null;
    }

    const json: unknown = await res.json();
    const parsed = KisIntradayResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] index intraday response parse failed");
      return null;
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] index intraday business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }

    const encoded = parseIndexMinuteRows(parsed.data.output2, targetDate);
    return indexBarsToChartBars(encoded);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] index intraday fetch failed: ${message}`);
    return null;
  }
};

export const fetchIndexQuote = async (iscd: string): Promise<IndexQuote | null> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for index quote");
    return null;
  }

  const url = new URL(BASE_URL + INDEX_PRICE_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "U");
  url.searchParams.set("FID_INPUT_ISCD", iscd);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_INDEX_PRICE,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis] index quote HTTP ${res.status}`);
      return null;
    }

    const json: unknown = await res.json();
    const parsed = KisResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] index quote response parse failed");
      return null;
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] index quote business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }

    const name = INDEX_NAME_BY_ISCD[iscd] ?? iscd;
    return normalizeIndexQuote(parsed.data.output, name);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] index quote fetch failed: ${message}`);
    return null;
  }
};

// marketDiv:
//   - fetchMultiQuote (watchlist ranking) 는 UN(KRX+NXT 통합) 고정 — 배지 시그널이
//     없어 통합 vol 유지가 이득.
//   - fetchStockQuote (종목 상세 헤더) 는 세션별 J/NX 토글 유지 — StockHeaderLivePrice
//     의 isNxtMiss 판정이 NX 응답의 iscd=null(비NXT 종목) → normalizeStockQuote=null
//     경로에 의존하므로 UN 통합 시 KRX 값이 흘러가 배지 회귀 발생.
const MARKET_DIV_INTEGRATED = "UN";

export const fetchStockQuote = async (
  ticker: string,
  marketDiv: "J" | "NX",
): Promise<StockQuote | null> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for stock quote");
    return null;
  }

  const url = new URL(BASE_URL + STOCK_PRICE_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketDiv);
  url.searchParams.set("FID_INPUT_ISCD", ticker);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_STOCK_PRICE,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[kis] stock quote HTTP ${res.status} ticker=${ticker} div=${marketDiv} body=${body.slice(0, 300)}`,
      );
      return null;
    }

    const json: unknown = await res.json();
    const parsed = KisResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] stock quote response parse failed");
      return null;
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] stock quote business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }

    return normalizeStockQuote(parsed.data.output, marketDiv === "J" ? "krx" : "nx");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] stock quote fetch failed: ${message}`);
    return null;
  }
};

// FHKST01010100 을 J(KRX) 로 호출해 raw output 을 parseMarketAction 에 통과.
// StockQuote 정규화 결과가 아닌 시장조치 상태만 필요할 때 사용 — 폴링 quote 응답
// 계약과 분리해 SSR 단발 호출로 소비하기 위한 슬림 경로.
// 자격/HTTP/rt_cd/파싱 실패는 null 반환.
export const fetchStockMarketAction = async (
  ticker: string,
): Promise<MarketActionStatus | null> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for stock market action");
    return null;
  }

  const url = new URL(BASE_URL + STOCK_PRICE_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", ticker);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_STOCK_PRICE,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        `[kis] stock market action HTTP ${res.status} ticker=${ticker}`,
      );
      return null;
    }

    const json: unknown = await res.json();
    const parsed = KisResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] stock market action response parse failed");
      return null;
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] stock market action business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }

    return parseMarketAction(parsed.data.output);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] stock market action fetch failed: ${message}`);
    return null;
  }
};

export type MultiQuoteResult = {
  quotes: Record<string, StockQuote | null>;
  // per-code 실패 신호. 응답 array에 없거나 normalizeMultiQuote 파싱 실패 → true.
  // 전체 실패(토큰/자격/HTTP/rt_cd/output 비-array) → 요청 전 티커 true.
  // F19 index failed map(#077 index-intraday) 이식 — N종목 중 일부 KIS 실패가
  // 전체 blank 로 번지지 않도록 소비측이 종목별 배지로 분기할 수 있게 한다.
  failed: Record<string, boolean>;
};

// 입력 tickers 전체를 키로 갖는 Record 반환. 실패·미응답 ticker는 quote=null, failed=true.
// 입력 순서 비의존 — 응답 row의 inter_shrn_iscd로 매칭한다.
// marketDiv 는 UN(통합) 고정 — fetchStockQuote 와 동일 근거.
export const fetchMultiQuote = async (
  tickers: string[],
): Promise<MultiQuoteResult> => {
  if (tickers.length === 0) return { quotes: {}, failed: {} };

  let effective = tickers;
  if (tickers.length > MULTI_QUOTE_LIMIT) {
    console.warn(
      `[kis] multi quote input ${tickers.length} exceeds limit ${MULTI_QUOTE_LIMIT}, truncating`,
    );
    effective = tickers.slice(0, MULTI_QUOTE_LIMIT);
  }

  const allFailed = (): MultiQuoteResult => ({
    quotes: Object.fromEntries(effective.map((t) => [t, null])),
    failed: Object.fromEntries(effective.map((t) => [t, true])),
  });

  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return allFailed();
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for multi quote");
    return allFailed();
  }

  const url = new URL(BASE_URL + MULTI_PRICE_PATH);
  effective.forEach((ticker, idx) => {
    const i = idx + 1; // KIS 파라미터 인덱스는 1-base
    url.searchParams.set(`FID_COND_MRKT_DIV_CODE_${i}`, MARKET_DIV_INTEGRATED);
    url.searchParams.set(`FID_INPUT_ISCD_${i}`, ticker);
  });

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_MULTI_PRICE,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis] multi quote HTTP ${res.status}`);
      return allFailed();
    }

    const json: unknown = await res.json();
    const parsed = KisResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] multi quote response parse failed");
      return allFailed();
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] multi quote business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return allFailed();
    }

    if (!Array.isArray(parsed.data.output)) {
      console.error("[kis] multi quote output is not an array");
      return allFailed();
    }

    const rowByTicker = new Map<string, unknown>();
    for (const row of parsed.data.output) {
      if (row && typeof row === "object" && "inter_shrn_iscd" in row) {
        const iscd = (row as { inter_shrn_iscd: unknown }).inter_shrn_iscd;
        if (typeof iscd === "string") {
          rowByTicker.set(iscd, row);
        }
      }
    }

    const quotes: Record<string, StockQuote | null> = {};
    const failed: Record<string, boolean> = {};
    for (const ticker of effective) {
      const row = rowByTicker.get(ticker);
      // 응답 없음(row undefined) 또는 normalize 파싱 실패(null) → failed.
      // 정상 파싱 → failed=false.
      const quote = row !== undefined ? normalizeMultiQuote(row) : null;
      quotes[ticker] = quote;
      failed[ticker] = quote === null;
    }
    return { quotes, failed };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] multi quote fetch failed: ${message}`);
    return allFailed();
  }
};

// 종목 분봉 anchor 1콜 헬퍼 — FHKST03010230 (date 지정 일별분봉). 당일·전일 공용.
// 실패 격리: 개별 anchor 실패가 전체 fetch 를 무너뜨리지 않도록 null 반환.
// FID_INPUT_DATE_1 로 대상 거래일 명시. FID_FAKE_TICK_INCU_YN 은 Y/N 무관하게 실체결
// 봉만 반환한다(실측) — 무체결 분은 densifyIntradayBars 가 채운다.
// 응답에서 stck_bsop_date === targetDate 인 행만 보존 (저유동성 종목은 응답 window 가
// 전일로 bleed 하므로 필수, #099-2 실측).
const callStockDailyMinuteAnchor = async (
  ticker: string,
  targetDateYyyymmdd: string,
  anchor: string,
  div: MinuteMarketDiv,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[] | null> => {
  const url = new URL(BASE_URL + STOCK_DAILY_MINUTE_PATH);
  url.searchParams.set("FID_ETC_CLS_CODE", "");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", div);
  url.searchParams.set("FID_INPUT_ISCD", ticker);
  url.searchParams.set("FID_INPUT_HOUR_1", anchor);
  url.searchParams.set("FID_INPUT_DATE_1", targetDateYyyymmdd);
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
  url.searchParams.set("FID_FAKE_TICK_INCU_YN", "N");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_STOCK_DAILY_MINUTE,
        custtype: "P",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[kis] stock daily minute anchor=${anchor} div=${div} date=${targetDateYyyymmdd} HTTP ${res.status}`,
      );
      return null;
    }
    const json: unknown = await res.json();
    const parsed = KisStockMinuteResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(
        `[kis] stock daily minute anchor=${anchor} div=${div} parse failed`,
      );
      return null;
    }
    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] stock daily minute anchor=${anchor} div=${div} rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }
    return parseDailyMinuteRows(parsed.data.output2, targetDateYyyymmdd);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[kis] stock daily minute anchor=${anchor} div=${div} fetch failed: ${message}`,
    );
    return null;
  }
};

// anchor fan-out + null anchor 단발 재시도. 230 경로에서 무데이터는 [] (target 필터 후) 로
// 오므로 null 은 실패 1종뿐이고, 실측 실패는 순간 burst 의 HTTP 500 이라 1s 뒤 그 anchor 만
// 1회 더 부르면 대부분 회복된다. 실패 종류(HTTP/rate_limit/timeout) 로 갈라 다루지 않는다.
// 재시도 뒤에도 null 이 남으면 failed — 성공 anchor 의 봉은 버리지 않고 호출측이 플래그만
// 얹는다 (결손본을 빈 응답으로 바꾸면 클라가 "직전본 유지 vs 부분본" 을 고를 수 없다).
// delayMs 주입은 테스트 전용.
const ANCHOR_RETRY_DELAY_MS = 1_000;

export const callAnchorsWithRetry = async (
  anchors: readonly string[],
  call: (anchor: string) => Promise<ChartBar[] | null>,
  delayMs: number = ANCHOR_RETRY_DELAY_MS,
): Promise<{ results: (ChartBar[] | null)[]; failed: boolean }> => {
  const results = await Promise.all(
    anchors.map(async (anchor) => {
      const first = await call(anchor);
      if (first !== null) return first;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return call(anchor);
    }),
  );
  return { results, failed: results.some((rows) => rows === null) };
};

// 전일 스냅샷 fallback — 당일과 같은 anchor 세트로 직전 완결 거래일 분봉을 가져온다.
// closed(주말·공휴일) 경로와 preopen(아침·늦은 프리오픈에서 오늘 봉이 없는 경우) 경로가
// 공유. NXT 판정은 호출측에서 넘겨받는다 (route 응답 date 정합을 위해 target 도 인자로).
// 저유동 종목은 anchor 창이 전일로 bleed 하므로 callStockDailyMinuteAnchor 의
// stck_bsop_date === target 필터에 기댄다.
// failed = 재시도 뒤에도 null 인 anchor 존재. bars 는 성공 anchor 병합본 (전부 실패면 []).
const fetchPreviousDaySnapshot = async (
  ticker: string,
  targetDateYyyymmdd: string,
  isNxt: boolean,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<{ bars: ChartBar[]; failed: boolean }> => {
  const anchors = getStockIntradayAnchors(isNxt);
  const div = getClosedFallbackMarketDiv(isNxt);
  const { results, failed } = await callAnchorsWithRetry(anchors, (anchor) =>
    callStockDailyMinuteAnchor(
      ticker,
      targetDateYyyymmdd,
      anchor,
      div,
      token,
      appKey,
      appSecret,
    ),
  );
  return { bars: mergeAndSortIntradayBars(results), failed };
};

// 전일 세션 마지막 tail (30봉) — 등락률 초기화 이후(pre/regular/after) 오늘 라이브 봉 앞에
// 컨텍스트 tail 로 prepend. anchor 는 각 세션의 마지막 anchor 1콜만 (FHKST03010230, 120봉/콜)
// → 슬롯 창으로 densify 한 뒤 마지막 30봉 slice. densify 하는 이유: 초기 표시 창이 tail 30봉을
// 되짚는데 sparse 응답은 저유동 종목에서 30봉이 수 시간을 압축해 "30봉 = 30분" 축이 깨진다.
// null = 재시도 뒤에도 조회 실패 — 당일 anchor 와 같은 규칙으로 응답 failed 에 합산된다.
const PREVIOUS_DAY_TAIL_BARS = 30;
const PREVIOUS_DAY_TAIL_ANCHOR_NXT = "200000";
const PREVIOUS_DAY_TAIL_ANCHOR_REGULAR = "153000";

const fetchPreviousDayTail = async (
  ticker: string,
  prevDate: string,
  isNxt: boolean,
  calendar: MarketCalendar,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[] | null> => {
  const anchor = isNxt
    ? PREVIOUS_DAY_TAIL_ANCHOR_NXT
    : PREVIOUS_DAY_TAIL_ANCHOR_REGULAR;
  const div: MinuteMarketDiv = isNxt ? "UN" : "J";
  const {
    results: [bars],
  } = await callAnchorsWithRetry([anchor], (a) =>
    callStockDailyMinuteAnchor(
      ticker,
      toKisDate(prevDate),
      a,
      div,
      token,
      appKey,
      appSecret,
    ),
  );
  if (bars === null) return null;
  const sorted = [...bars].sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
  return densifyIntradayBars(
    sorted,
    buildDaySlots(prevDate, LAST_MINUTE_OF_DAY, isNxt, calendar),
  ).slice(-PREVIOUS_DAY_TAIL_BARS);
};

export type StockIntradayChartResult = {
  bars: ChartBar[];
  tradingDate: string; // 'YYYY-MM-DD' — bars 가 실제로 속한 KST 거래일
  previousDay: boolean; // true = 전일 스냅샷 fallback (오늘 봉 부재)
  failed: boolean; // true = 재시도 뒤에도 null 인 anchor 존재 (bars 는 성공분만 담긴 결손본)
};

// 종목 분봉 차트. adaptive fan-out + preopen/closed 시 전일 스냅샷 fallback + 등락률
// 초기화 이후엔 전일 tail 30봉 prepend (연속 컨텍스트).
// - 활성 세션 (pre / regular / after) + latePreopen (08:50~09:00): 라이브 fan-out +
//   전일 tail 30봉 prepend. tradingDate = 오늘 KST 캘린더 (latePreopen 도 오늘).
//   비NXT pre / latePreopen 은 라이브 anchor 미매치 → tail 만 반환.
// - after_close (20:00~06:00): 라이브 fan-out 만 (오늘 확장 세션 완결 · tail 불필요).
// - 아침 프리오픈 (06:00~08:00): 오늘 봉 부재 확정 → 즉시 전일 스냅샷 (등락률 초기화 전).
// - closed (주말·공휴일): 전일 스냅샷.
// null = 자격/토큰 실패. anchor 실패는 null 이 아니라 failed:true 로 — 성공 anchor 봉을
// 그대로 실어 보내야 클라가 직전본 유지 여부를 고를 수 있다. now 주입 가능 — 로컬 테스트용.
export const fetchStockIntradayChart = async (
  ticker: string,
  now: Date = new Date(),
): Promise<StockIntradayChartResult | null> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for stock intraday");
    return null;
  }

  // 캘린더는 모듈 memo — 시그니처로 뚫지 않는다.
  const calendar = await getMarketCalendar();
  const session = getKrxSessionState(now, calendar);
  const todayTradingDate = getKrxTradingDate(now, calendar); // active 세션이면 오늘, 아니면 직전 거래일
  const earlyPreopen = isKrxEarlyPreopen(now, calendar);
  const latePreopen = isKrxLatePreopen(now, calendar);

  // NXT 판정 소스: quote_snapshots.nx_eligible (20:10 KST 캡처). 상장 당일은 익일 인식,
  // 스냅샷 부재(신규 종목·캡처 실패) → 비NXT (정규장 J 만 요청, 확장 세션 봉 손실 감수).
  const isNxt = (await fetchNxEligible(ticker)) ?? false;

  // 아침 프리오픈: NXT 프리 미개시 → 오늘 봉 자체 없음. 바로 전일 스냅샷으로.
  if (earlyPreopen) {
    const prevDate = getPreviousKrxTradingDate(todayTradingDate, calendar);
    const { bars, failed } = await fetchPreviousDaySnapshot(
      ticker,
      toKisDate(prevDate),
      isNxt,
      tokenResult.token,
      appKey,
      appSecret,
    );
    return { bars, tradingDate: prevDate, previousDay: true, failed };
  }

  // closed (주말·공휴일): 직전 완결 거래일 스냅샷. todayTradingDate 는 이미 직전 거래일.
  if (session === "closed") {
    const { bars, failed } = await fetchPreviousDaySnapshot(
      ticker,
      toKisDate(todayTradingDate),
      isNxt,
      tokenResult.token,
      appKey,
      appSecret,
    );
    return {
      bars,
      tradingDate: todayTradingDate,
      previousDay: true,
      failed,
    };
  }

  // 활성 세션 + latePreopen + after_close — 당일 fan-out 경로 진입.
  const { minutes: nowMin } = getKstDateAndMinutes(now);
  const anchorSet = getStockIntradayAnchors(isNxt);
  const div: MinuteMarketDiv = isNxt ? "UN" : "J";

  // 활성 세션(pre/regular/after) + latePreopen: 현재 분까지. after_close(20:00 이후
  // 야간·새벽): 오늘 확장 세션 이미 완결 → 하루 전체 (세션 술어가 창 끝을 정한다).
  const isActiveOrLatePreopen =
    session === "pre" ||
    session === "regular" ||
    session === "after" ||
    latePreopen;
  const cutoffMin = isActiveOrLatePreopen ? nowMin : LAST_MINUTE_OF_DAY;

  // 라이브 봉이 붙는 KST 거래일. 활성 세션 + latePreopen 이면 오늘, after_close 는
  // completed session — 둘 다 거래일 축이 그대로 답한다.
  const barsDate = todayTradingDate;
  const slots = buildDaySlots(barsDate, cutoffMin, isNxt, calendar);

  // 슬롯이 아직 없으면(비NXT pre·latePreopen) fan-out 없음. 그 외엔 직전 anchor 이후로
  // 분이 흘렀을 때만 다음 anchor 를 요청 — KIS 가 미래 anchor 를 now 로 클램프하므로
  // 직전 anchor 와 창이 겹치는 anchor 는 중복 콜이다.
  const anchors =
    slots.length === 0
      ? []
      : anchorSet.filter(
          (_, i) => i === 0 || anchorToMinutes(anchorSet[i - 1]) < cutoffMin,
        );

  // 전일 tail source date. 등락률 초기화(08:00) ~ 애프터 마감(20:00) 동안 "어제 마감 → 오늘"
  // 연속 컨텍스트 30봉 prepend. after_close 는 오늘 완결본 그대로 (tail 없음).
  const tailSourceDate = isActiveOrLatePreopen
    ? getPreviousKrxTradingDate(barsDate, calendar)
    : null;

  // 당일 fan-out + 전일 tail 병렬 fetch — 지연 최소화.
  // 재시도 뒤에도 null 인 anchor(당일·tail 불문) 는 성공분만 병합하고 failed 로 알린다.
  const [live, tailBars] = await Promise.all([
    callAnchorsWithRetry(anchors, (anchor) =>
      callStockDailyMinuteAnchor(
        ticker,
        toKisDate(barsDate),
        anchor,
        div,
        tokenResult.token,
        appKey,
        appSecret,
      ),
    ),
    tailSourceDate === null
      ? Promise.resolve<ChartBar[] | null>([])
      : fetchPreviousDayTail(
          ticker,
          tailSourceDate,
          isNxt,
          calendar,
          tokenResult.token,
          appKey,
          appSecret,
        ),
  ]);

  const failed = live.failed || tailBars === null;

  // 라이브 anchor 가 하나도 안 걸리는 케이스 (pre 비NXT · latePreopen 비NXT): tail 만 반환.
  // tail 조차 [] 이면 empty 응답 → client 가 "정규장 개장 전" 안내로 자연 폴백.
  if (anchors.length === 0) {
    return {
      bars: tailBars ?? [],
      tradingDate: barsDate,
      previousDay: false,
      failed,
    };
  }

  // tail + 당일 병합 후 densify. 저유동 종목은 anchor 창이 겹쳐 같은 봉이 여러 anchor 에
  // 실려 오므로 time key dedup + ASC 정렬 (lightweight-charts 요구조건). tail 을 먼저
  // 합치는 이유: 첫 체결 전 슬롯의 fill 종가가 전일 마지막 봉까지 거슬러 올라가야
  // KIS 자체 fill 과 같은 형상이 된다.
  const combined = mergeAndSortIntradayBars([tailBars, ...live.results]);

  return {
    bars: densifyIntradayBars(combined, slots),
    tradingDate: barsDate,
    previousDay: false,
    failed,
  };
};
