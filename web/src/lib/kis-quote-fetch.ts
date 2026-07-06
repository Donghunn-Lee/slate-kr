import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import { normalizeIndexQuote, normalizeMultiQuote, normalizeStockQuote } from "@/lib/kis-quote";
import type { ChartBar, IndexQuote, StockQuote } from "@/shared/types/quote";
import {
  getKrxSessionState,
  getKrxTradingDate,
  getKstDateAndMinutes,
} from "@/shared/utils/market";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INDEX_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-index-price";
const INDEX_INTRADAY_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice";
const STOCK_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
const STOCK_MINUTE_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice";
const MULTI_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice";
const TR_ID_INDEX_PRICE = "FHPUP02100000";
const TR_ID_INDEX_INTRADAY = "FHKUP03500200";
const TR_ID_STOCK_PRICE = "FHKST01010100";
const TR_ID_STOCK_MINUTE = "FHKST03010200";
const TR_ID_MULTI_PRICE = "FHKST11300006";
const MULTI_QUOTE_LIMIT = 30; // KIS 공식 상한
const INTRADAY_INTERVAL_SEC = "600"; // 10분봉

// 종목 1분봉 fan-out anchors — 각 anchor 는 (anchor-30min, anchor] 창의 30개 봉을 반환.
// 13개 * 30봉 = 09:01~15:30 KST (정규장 390분 커버, 09:00 개장봉은 이 endpoint 특성상 제외).
const STOCK_INTRADAY_ANCHORS = [
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
const REGULAR_END_MIN = 15 * 60 + 30;

const anchorToMinutes = (a: string): number =>
  Number(a.slice(0, 2)) * 60 + Number(a.slice(2, 4));

const INDEX_NAME_BY_ISCD: Record<string, string> = {
  "0001": "코스피",
  "1001": "코스닥",
  "2001": "코스피200",
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
const kstToFakeUtcSec = (yyyymmdd: string, hhmmss: string): number =>
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

// 지수 10분봉 차트. 마커 행 제거, 시간 ASC 정렬.
// null = 호출 자체 실패, [] = 응답에 데이터 없음(preopen/휴장 등).
export const fetchIndexIntradayChart = async (
  iscd: string,
): Promise<IndexIntradayBar[] | null> => {
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
  url.searchParams.set("FID_INPUT_HOUR_1", INTRADAY_INTERVAL_SEC);
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
  url.searchParams.set("FID_ETC_CLS_CODE", "0");

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

    const bars: IndexIntradayBar[] = parsed.data.output2
      .filter((row) => !INTRADAY_MARKERS.has(row.stck_cntg_hour))
      .map((row) => ({
        timestamp: kstToFakeUtcSec(row.stck_bsop_date, row.stck_cntg_hour),
        open: row.bstp_nmix_oprc,
        high: row.bstp_nmix_hgpr,
        low: row.bstp_nmix_lwpr,
        close: row.bstp_nmix_prpr,
        volume: row.cntg_vol,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return bars;
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

// 입력 tickers 전체를 키로 갖는 Record 반환. 실패·미응답 ticker는 null.
// 입력 순서 비의존 — 응답 row의 inter_shrn_iscd로 매칭한다.
export const fetchMultiQuote = async (
  tickers: string[],
  marketDiv: "J" | "NX",
): Promise<Record<string, StockQuote | null>> => {
  if (tickers.length === 0) return {};

  let effective = tickers;
  if (tickers.length > MULTI_QUOTE_LIMIT) {
    console.warn(
      `[kis] multi quote input ${tickers.length} exceeds limit ${MULTI_QUOTE_LIMIT}, truncating`,
    );
    effective = tickers.slice(0, MULTI_QUOTE_LIMIT);
  }

  const allNull = (): Record<string, StockQuote | null> =>
    Object.fromEntries(effective.map((t) => [t, null]));

  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return allNull();
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for multi quote");
    return allNull();
  }

  const url = new URL(BASE_URL + MULTI_PRICE_PATH);
  effective.forEach((ticker, idx) => {
    const i = idx + 1; // KIS 파라미터 인덱스는 1-base
    url.searchParams.set(`FID_COND_MRKT_DIV_CODE_${i}`, marketDiv);
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
      return allNull();
    }

    const json: unknown = await res.json();
    const parsed = KisResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis] multi quote response parse failed");
      return allNull();
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] multi quote business error rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return allNull();
    }

    if (!Array.isArray(parsed.data.output)) {
      console.error("[kis] multi quote output is not an array");
      return allNull();
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

    const result: Record<string, StockQuote | null> = {};
    for (const ticker of effective) {
      const row = rowByTicker.get(ticker);
      result[ticker] = row !== undefined ? normalizeMultiQuote(row) : null;
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] multi quote fetch failed: ${message}`);
    return allNull();
  }
};

// 종목 1분봉 fan-out 헬퍼. anchor 1개 호출 → 성공 시 ChartBar[], 실패 시 null.
// 실패 격리: 개별 anchor 실패가 전체 fetch 를 무너뜨리지 않도록 null 반환.
const callStockMinuteAnchor = async (
  ticker: string,
  anchor: string,
  token: string,
  appKey: string,
  appSecret: string,
): Promise<ChartBar[] | null> => {
  const url = new URL(BASE_URL + STOCK_MINUTE_PATH);
  url.searchParams.set("FID_ETC_CLS_CODE", "");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
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
        `[kis] stock intraday anchor=${anchor} HTTP ${res.status}`,
      );
      return null;
    }
    const json: unknown = await res.json();
    const parsed = KisStockMinuteResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[kis] stock intraday anchor=${anchor} parse failed`);
      return null;
    }
    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] stock intraday anchor=${anchor} rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }
    return parsed.data.output2
      .filter((r) => !INTRADAY_MARKERS.has(r.stck_cntg_hour))
      .map((r) => ({
        time: kstToFakeUtcSec(r.stck_bsop_date, r.stck_cntg_hour),
        open: r.stck_oprc,
        high: r.stck_hgpr,
        low: r.stck_lwpr,
        close: r.stck_prpr,
        volume: r.cntg_vol,
      }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[kis] stock intraday anchor=${anchor} fetch failed: ${message}`,
    );
    return null;
  }
};

// 종목 당일 1분봉. 13콜 fan-out → dedupe → ASC. 세션 상태에 따라 필요한 anchor 만 콜.
// null = 자격/토큰 실패, [] = 세션상 데이터 없음(pre/preopen/휴장 등), ChartBar[] = 성공(부분 포함).
export const fetchStockIntradayChart = async (
  ticker: string,
): Promise<ChartBar[] | null> => {
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

  // 세션 게이트: endpoint 는 "today KST" 만 반환하므로 tradingDate!=today 면 fetch 무의미.
  // pre 는 정규장 개시 전이라 봉 자체가 없음.
  const { date: todayKst, minutes: nowMin } = getKstDateAndMinutes();
  const tradingDate = getKrxTradingDate();
  if (tradingDate !== todayKst) return [];
  const session = getKrxSessionState();
  if (session === "pre") return [];

  // regular 중: 현재 시각 + 30분(=미래 30분 이내 anchor 까지) 이하만.
  // regular 후 (after/after_close 저녁/이례적으로 오늘=tradingDate 인 그 외): 13개 전체.
  const cutoffMin =
    session === "regular" ? nowMin + 30 : REGULAR_END_MIN + 30;
  const anchors = STOCK_INTRADAY_ANCHORS.filter(
    (a) => anchorToMinutes(a) <= cutoffMin,
  );
  if (anchors.length === 0) return [];

  // 병렬 fan-out. 실패 anchor 는 null → 성공분만 병합.
  const results = await Promise.all(
    anchors.map((a) =>
      callStockMinuteAnchor(ticker, a, tokenResult.token, appKey, appSecret),
    ),
  );
  const merged = new Map<number, ChartBar>();
  for (const rows of results) {
    if (!rows) continue;
    for (const bar of rows) merged.set(bar.time as number, bar);
  }
  // 미래 봉 방어 필터. anchor 창 내에서 현재 시각 이후 봉을 KIS 는 마지막 체결가로 fill-forward
  // 하므로(실측: 13:39 KST 조회 시 13:40~13:59 가 동일 close, 14:00 는 이례적 값) 클라이언트가
  // 정지 화면을 보게 된다. 지금 시각을 KST fake-utc 로 환산해 이후 봉 제거.
  const nowFakeUtcSec = Math.floor((Date.now() + 9 * 60 * 60 * 1000) / 1000);
  return Array.from(merged.values())
    .filter((b) => (b.time as number) <= nowFakeUtcSec)
    .sort((a, b) => (a.time as number) - (b.time as number));
};
