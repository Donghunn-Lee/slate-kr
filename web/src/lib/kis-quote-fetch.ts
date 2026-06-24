import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import { normalizeIndexQuote, normalizeStockQuote } from "@/lib/kis-quote";
import type { IndexQuote, StockQuote } from "@/shared/types/quote";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INDEX_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-index-price";
const STOCK_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
const TR_ID_INDEX_PRICE = "FHPUP02100000";
const TR_ID_STOCK_PRICE = "FHKST01010100";

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
