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
  isKrxEarlyPreopen,
  isKrxLatePreopen,
} from "@/shared/utils/market";
import { getMarketCalendar } from "@/lib/marketCalendar";
import { mergeChartBars } from "@/shared/utils/toEndLabelBars";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INDEX_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-index-price";
const INDEX_INTRADAY_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice";
const STOCK_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
const STOCK_MINUTE_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice";
// FHKST03010230 (주식일별분봉조회) — date 파라미터 지원. 120봉/콜, 페이지네이션 없음.
// closed 세션 fallback 에서만 사용 (직전 완결 거래일 조회). #099-2·#099-5 실측 근거.
const STOCK_DAILY_MINUTE_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice";
const MULTI_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice";
const TR_ID_INDEX_PRICE = "FHPUP02100000";
const TR_ID_INDEX_INTRADAY = "FHKUP03500200";
const TR_ID_STOCK_PRICE = "FHKST01010100";
const TR_ID_STOCK_MINUTE = "FHKST03010200";
const TR_ID_STOCK_DAILY_MINUTE = "FHKST03010230";
const TR_ID_MULTI_PRICE = "FHKST11300006";
const MULTI_QUOTE_LIMIT = 30; // KIS 공식 상한

// 종목 1분봉 fan-out anchors — 각 anchor 는 (anchor-30min, anchor] 창의 30개 봉을 반환.
// NXT 거래가능 종목은 UN 로 25개(08:00~20:00) 전체 요청, 비NXT 종목은 J 로 13개
// (09:30~15:30) 정규장만 요청. eligibility 는 probeNxtEligibility 로 판정.
type MinuteMarketDiv = "J" | "UN";
const STOCK_INTRADAY_ANCHORS_NXT: readonly string[] = [
  "080000",
  "083000",
  "090000",
  "093000",
  "100000",
  "103000",
  "110000",
  "113000",
  "120000",
  "123000",
  "130000",
  "133000",
  "140000",
  "143000",
  "150000",
  "153000",
  "160000",
  "163000",
  "170000",
  "173000",
  "180000",
  "183000",
  "190000",
  "193000",
  "200000",
] as const;
const STOCK_INTRADAY_ANCHORS_REGULAR: readonly string[] = [
  "093000",
  "100000",
  "103000",
  "110000",
  "113000",
  "120000",
  "123000",
  "130000",
  "133000",
  "140000",
  "143000",
  "150000",
  "153000",
] as const;
// NXT eligibility probe anchor — 미들데이. 어느 세션이든 (KIS docstring: 미래 anchor 는
// 현재 시각으로 clamp) 실거래 시간대 데이터를 반환. NXT 종목이면 UN 응답이 실봉,
// 비NXT 종목이면 sentinel(OHL=0) → callStockMinuteAnchor 내부 필터로 [] 반환.
const NXT_PROBE_ANCHOR = "120000";
// 확장 세션 상한 (NXT 애프터 종료). 세션 종료 후 anchor 필터 상한으로 사용.
const AFTER_END_MIN = 20 * 60;

// closed 세션 fallback (FHKST03010230) anchor 세트. 120봉/콜 특성상 라이브 경로
// (30봉/콜) 대비 anchor 수가 크게 줄어든다 — 액티브 티커 기준 anchor 당 ~2h 커버.
// NXT: 08:00~20:00 (720분) 커버, 2h 간격 + 90000 프리 헤드 + 200000 애프터 테일.
// 비NXT: 09:00~15:30 (390분) 커버, 2h 간격 + 153000 마감.
// 저유동성 종목은 anchor window 가 시각적으로 길어져 target 밖 봉을 포함할 수 있으므로
// callStockDailyMinuteAnchor 내부에서 stck_bsop_date === target 필터로 bleed 방어.
const STOCK_INTRADAY_CLOSED_ANCHORS_NXT: readonly string[] = [
  "090000",
  "110000",
  "130000",
  "150000",
  "170000",
  "190000",
  "200000",
] as const;
const STOCK_INTRADAY_CLOSED_ANCHORS_REGULAR: readonly string[] = [
  "110000",
  "130000",
  "153000",
] as const;

// closed fallback 설정 셀렉터 — NXT 여부로 anchor 세트/마켓코드 선택. 테스트 전용 export.
export const getClosedFallbackAnchors = (isNxt: boolean): readonly string[] =>
  isNxt ? STOCK_INTRADAY_CLOSED_ANCHORS_NXT : STOCK_INTRADAY_CLOSED_ANCHORS_REGULAR;

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

// KST wall-clock now → fake-UTC epoch sec. 라이브 경로의 미래 봉 방어 필터에 사용.
const nowKstFakeUtcSec = (now: Date): number =>
  Math.floor((now.getTime() + 9 * 60 * 60 * 1000) / 1000);

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

    return normalizeStockQuote(parsed.data.output);
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

// 종목 1분봉 fan-out 헬퍼. anchor 1개 호출 → 성공 시 ChartBar[], 실패 시 null.
// 실패 격리: 개별 anchor 실패가 전체 fetch 를 무너뜨리지 않도록 null 반환.
// marketDiv 는 anchor 목록에서 명시된 값 사용 (정규장=J, NXT 프리/애프터=NX).
const callStockMinuteAnchor = async (
  ticker: string,
  anchor: string,
  div: MinuteMarketDiv,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[] | null> => {
  const url = new URL(BASE_URL + STOCK_MINUTE_PATH);
  url.searchParams.set("FID_ETC_CLS_CODE", "");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", div);
  url.searchParams.set("FID_INPUT_ISCD", ticker);
  url.searchParams.set("FID_INPUT_HOUR_1", anchor); // HHMMSS 시각 anchor
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_STOCK_MINUTE,
        custtype: "P",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[kis] stock intraday anchor=${anchor} div=${div} HTTP ${res.status}`,
      );
      return null;
    }
    const json: unknown = await res.json();
    const parsed = KisStockMinuteResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[kis] stock intraday anchor=${anchor} div=${div} parse failed`);
      return null;
    }
    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] stock intraday anchor=${anchor} div=${div} rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }
    return parsed.data.output2
      .filter((r) => !INTRADAY_MARKERS.has(r.stck_cntg_hour))
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[kis] stock intraday anchor=${anchor} div=${div} fetch failed: ${message}`,
    );
    return null;
  }
};

// closed 세션 fallback 헬퍼 — FHKST03010230 (date 지정 일별분봉) anchor 1콜.
// FID_INPUT_DATE_1 로 대상 거래일 명시. FID_FAKE_TICK_INCU_YN=N: 허봉 제외.
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

// NXT 거래가능 판정 — 미들데이 UN anchor 1콜 → sentinel 필터 후 실봉이 남아있으면
// NXT 종목. KIS 종목 마스터에 NXT 플래그가 없어 데이터 파생으로 감지 (agent 조사 확인).
// null(요청 실패) → 보수적으로 비NXT 취급 (정규장 J 만 요청, 확장 세션 봉 손실 감수).
const probeNxtEligibility = async (
  ticker: string,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<boolean> => {
  const bars = await callStockMinuteAnchor(
    ticker,
    NXT_PROBE_ANCHOR,
    "UN",
    token,
    appKey,
    appSecret,
  );
  return bars !== null && bars.length > 0;
};

// NXT 판정은 tradingDate 내 불변 (상장/해지가 아닌 이상) — 종목당 하루 1회 probe 로 충분.
// 종목당 {tradingDate,value} 하나만 유지. 서버 인스턴스가 다음날까지 살아도 date
// 미스매치로 자동 재조회. Map 크기는 유니크 티커 수로 상한.
const nxtEligibilityByTicker = new Map<
  string,
  { tradingDate: string; value: boolean }
>();

const probeNxtEligibilityMemoized = async (
  ticker: string,
  tradingDate: string,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<boolean> => {
  const cached = nxtEligibilityByTicker.get(ticker);
  if (cached && cached.tradingDate === tradingDate) return cached.value;
  const value = await probeNxtEligibility(ticker, token, appKey, appSecret);
  nxtEligibilityByTicker.set(ticker, { tradingDate, value });
  return value;
};

// 전일 스냅샷 fallback — FHKST03010230 anchor 세트로 직전 완결 거래일 분봉을 가져온다.
// closed(주말·공휴일) 경로와 preopen(아침·늦은 프리오픈에서 오늘 봉이 없는 경우) 경로가
// 공유. NXT 판정은 호출측에서 넘겨받는다 (route 응답 date 정합을 위해 target 도 인자로).
const fetchPreviousDaySnapshot = async (
  ticker: string,
  targetDateYyyymmdd: string,
  isNxt: boolean,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[] | null> => {
  const anchors = getClosedFallbackAnchors(isNxt);
  const div = getClosedFallbackMarketDiv(isNxt);
  const results = await Promise.all(
    anchors.map((anchor) =>
      callStockDailyMinuteAnchor(
        ticker,
        targetDateYyyymmdd,
        anchor,
        div,
        token,
        appKey,
        appSecret,
      ),
    ),
  );
  if (results.every((rows) => rows === null)) return null;
  return mergeAndSortIntradayBars(results);
};

// 전일 세션 마지막 tail (30봉) — 등락률 초기화 이후(pre/regular/after) 오늘 라이브 봉 앞에
// 컨텍스트 tail 로 prepend. anchor 는 각 세션의 마지막 anchor 1콜만 (FHKST03010230, 120봉/콜)
// → 시간 ASC 정렬 후 마지막 30봉 slice. 조회 실패는 [] 로 소프트 페일 (본 응답에 치명적 아님).
const PREVIOUS_DAY_TAIL_BARS = 30;
const PREVIOUS_DAY_TAIL_ANCHOR_NXT = "200000";
const PREVIOUS_DAY_TAIL_ANCHOR_REGULAR = "153000";

const fetchPreviousDayTail = async (
  ticker: string,
  prevDateYyyymmdd: string,
  isNxt: boolean,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[]> => {
  const anchor = isNxt
    ? PREVIOUS_DAY_TAIL_ANCHOR_NXT
    : PREVIOUS_DAY_TAIL_ANCHOR_REGULAR;
  const div: MinuteMarketDiv = isNxt ? "UN" : "J";
  const bars = await callStockDailyMinuteAnchor(
    ticker,
    prevDateYyyymmdd,
    anchor,
    div,
    token,
    appKey,
    appSecret,
  );
  if (bars === null) return [];
  const sorted = [...bars].sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
  return sorted.slice(-PREVIOUS_DAY_TAIL_BARS);
};

export type StockIntradayChartResult = {
  bars: ChartBar[];
  tradingDate: string; // 'YYYY-MM-DD' — bars 가 실제로 속한 KST 거래일
  previousDay: boolean; // true = 전일 스냅샷 fallback (오늘 봉 부재)
};

// 종목 분봉 차트. adaptive fan-out + preopen/closed 시 전일 스냅샷 fallback + 등락률
// 초기화 이후엔 전일 tail 30봉 prepend (연속 컨텍스트).
// - 활성 세션 (pre / regular / after) + latePreopen (08:50~09:00): 라이브 fan-out +
//   전일 tail 30봉 prepend. tradingDate = 오늘 KST 캘린더 (latePreopen 도 오늘).
//   비NXT pre / latePreopen 은 라이브 anchor 미매치 → tail 만 반환.
// - after_close (20:00~06:00): 라이브 fan-out 만 (오늘 확장 세션 완결 · tail 불필요).
// - 아침 프리오픈 (06:00~08:00): 오늘 봉 부재 확정 → 즉시 전일 스냅샷 (등락률 초기화 전).
// - closed (주말·공휴일): 전일 스냅샷.
// null = 자격/토큰 실패 또는 fan-out 전체 실패. now 주입 가능 — 로컬 테스트용.
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

  const isNxt = await probeNxtEligibilityMemoized(
    ticker,
    todayTradingDate,
    tokenResult.token,
    appKey,
    appSecret,
  );

  // 아침 프리오픈: NXT 프리 미개시 → 오늘 봉 자체 없음. 바로 전일 스냅샷으로.
  if (earlyPreopen) {
    const prevDate = getPreviousKrxTradingDate(todayTradingDate, calendar);
    const bars = await fetchPreviousDaySnapshot(
      ticker,
      toKisDate(prevDate),
      isNxt,
      tokenResult.token,
      appKey,
      appSecret,
    );
    if (bars === null) return null;
    return { bars, tradingDate: prevDate, previousDay: true };
  }

  // closed (주말·공휴일): 직전 완결 거래일 스냅샷. todayTradingDate 는 이미 직전 거래일.
  if (session === "closed") {
    const bars = await fetchPreviousDaySnapshot(
      ticker,
      toKisDate(todayTradingDate),
      isNxt,
      tokenResult.token,
      appKey,
      appSecret,
    );
    if (bars === null) return null;
    return {
      bars,
      tradingDate: todayTradingDate,
      previousDay: true,
    };
  }

  // 활성 세션 + latePreopen + after_close — 라이브 fan-out 경로 진입.
  const { minutes: nowMin, date: nowKstDate } = getKstDateAndMinutes(now);
  const anchorSet = isNxt
    ? STOCK_INTRADAY_ANCHORS_NXT
    : STOCK_INTRADAY_ANCHORS_REGULAR;
  const div: MinuteMarketDiv = isNxt ? "UN" : "J";

  // 활성 세션(pre/regular/after) + latePreopen: 현재 시각 + 30분 이내 anchor.
  // after_close(20:00 이후 야간·새벽): 오늘 확장 세션 이미 완결 → 전 anchor 요청.
  const isActiveOrLatePreopen =
    session === "pre" ||
    session === "regular" ||
    session === "after" ||
    latePreopen;
  const cutoffMin = isActiveOrLatePreopen ? nowMin + 30 : AFTER_END_MIN + 30;
  const anchors = anchorSet.filter(
    (anchor) => anchorToMinutes(anchor) <= cutoffMin,
  );

  // 라이브 봉이 붙는 KST 거래일. 활성 세션 + latePreopen 은 오늘 KST 캘린더 (latePreopen 도
  // 오늘 08:00~08:50 pre 봉과 quote 축 정합화 위해 오늘로 통일 — getKrxTradingDate 는
  // preopen 을 전일로 리포트하므로 재계산). after_close 는 completed session 그대로.
  const barsDate = isActiveOrLatePreopen ? nowKstDate : todayTradingDate;

  // 전일 tail source date. 등락률 초기화(08:00) ~ 애프터 마감(20:00) 동안 "어제 마감 → 오늘"
  // 연속 컨텍스트 30봉 prepend. after_close 는 오늘 완결본 그대로 (tail 없음).
  const tailSourceDate = isActiveOrLatePreopen
    ? getPreviousKrxTradingDate(barsDate, calendar)
    : null;

  // 라이브 fan-out + 전일 tail 병렬 fetch — 지연 최소화.
  // 실패 anchor 는 null → 성공분만 병합. tail 실패는 [] 로 소프트 페일.
  const [liveResults, tailBars] = await Promise.all([
    Promise.all(
      anchors.map((anchor) =>
        callStockMinuteAnchor(
          ticker,
          anchor,
          div,
          tokenResult.token,
          appKey,
          appSecret,
        ),
      ),
    ),
    tailSourceDate === null
      ? Promise.resolve<ChartBar[]>([])
      : fetchPreviousDayTail(
          ticker,
          toKisDate(tailSourceDate),
          isNxt,
          tokenResult.token,
          appKey,
          appSecret,
        ),
  ]);

  // 라이브 anchor 가 하나도 안 걸리는 케이스 (pre 비NXT · latePreopen 비NXT): tail 만 반환.
  // tail 조차 [] 이면 empty 응답 → client 가 "정규장 개장 전" 안내로 자연 폴백.
  if (anchors.length === 0) {
    return {
      bars: tailBars,
      tradingDate: barsDate,
      previousDay: false,
    };
  }

  // 전체 anchor 가 실패 (모두 null) 인 경우 정상 empty([]) 와 구분하기 위해 null 반환.
  // 부분 성공은 기존대로 merged 결과 반환 (성공분만 노출).
  if (liveResults.every((rows) => rows === null)) return null;

  // 미래 봉 방어 필터. anchor 창 내에서 현재 시각 이후 봉을 KIS 는 마지막 체결가로 fill-forward
  // 하므로(실측: 13:39 KST 조회 시 13:40~13:59 가 동일 close, 14:00 는 이례적 값) 클라이언트가
  // 정지 화면을 보게 된다. 지금 시각을 KST fake-utc 로 환산해 이후 봉 제거.
  const cutoffFakeUtcSec = nowKstFakeUtcSec(now);
  const liveBars = mergeAndSortIntradayBars(liveResults).filter(
    (b) => (b.time as number) <= cutoffFakeUtcSec,
  );

  // tail + live 병합 — KIS 라이브 anchor 는 트레이딩 없는 창(NXT "080000" 의 (07:30, 08:00]
  // 등) 을 전일 후반 봉으로 backfill 하는 실측 패턴 → tail 과 time 중복 발생.
  // mergeAndSortIntradayBars 로 time key dedup + ASC 정렬 (lightweight-charts 요구조건).
  const combined = mergeAndSortIntradayBars([tailBars, liveBars]);

  return {
    bars: combined,
    tradingDate: barsDate,
    previousDay: false,
  };
};
