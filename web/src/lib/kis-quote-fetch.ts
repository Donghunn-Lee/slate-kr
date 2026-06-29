import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import { normalizeIndexQuote, normalizeMultiQuote, normalizeStockQuote } from "@/lib/kis-quote";
import type { IndexQuote, StockQuote } from "@/shared/types/quote";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INDEX_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-index-price";
const INDEX_INTRADAY_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice";
const STOCK_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
const MULTI_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice";
const TR_ID_INDEX_PRICE = "FHPUP02100000";
const TR_ID_INDEX_INTRADAY = "FHKUP03500200";
const TR_ID_STOCK_PRICE = "FHKST01010100";
const TR_ID_MULTI_PRICE = "FHKST11300006";
const MULTI_QUOTE_LIMIT = 30; // KIS 공식 상한
const INTRADAY_INTERVAL_SEC = "600"; // 10분봉

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
      console.error(`[kis] stock quote HTTP ${res.status}`);
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
