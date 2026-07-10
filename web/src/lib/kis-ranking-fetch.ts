import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import type {
  Market,
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const FLUCTUATION_PATH = "/uapi/domestic-stock/v1/ranking/fluctuation";
const VOLUME_PATH = "/uapi/domestic-stock/v1/quotations/volume-rank";
const TR_ID_FLUCTUATION = "FHPST01700000";
const TR_ID_VOLUME = "FHPST01710000";

// E16 probe 실측 확정: 우선주(5)/ETF(7)/ETN(8)/SPAC(10) 자리를 1로 켜 제외.
// 관리종목·투자경고까지 강화 필요 시 앞 두 자리도 1로 (예: "1100101101").
const TRGT_EXLS_CODE = "0000101101";

// E16 probe 실측: 두 endpoint 동일 코드. 0001=KOSPI 전체, 1001=KOSDAQ 전체, 0000=혼재.
// 노이즈 필터(EXLS)는 KOSPI/KOSDAQ 필터와 병존 유효.
const MARKET_TO_ISCD: Record<Market, string> = {
  all: "0000",
  kospi: "0001",
  kosdaq: "1001",
};

export type RankingFetchResult =
  | { ok: true; items: MarketRankingItem[] }
  | { ok: false; error: RankingFetchError };

export type RankingFetchError =
  | { kind: "token_failed" }
  | { kind: "missing_credentials" }
  | { kind: "http_error"; status: number }
  | { kind: "business_error"; message: string } // rt_cd != 0
  | { kind: "parse_error" } // envelope shape 불일치
  | { kind: "network_error"; message: string };

const KisEnvelopeSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output: z.array(z.unknown()).optional(),
});

const FluctuationRowSchema = z.object({
  stck_shrn_iscd: z.string(),
  hts_kor_isnm: z.string(),
  stck_prpr: z.string(),
  prdy_vrss: z.string(),
  prdy_ctrt: z.string(),
  prdy_vrss_sign: z.string(),
  data_rank: z.string(),
  acml_vol: z.string(),
});

const VolumeRowSchema = z.object({
  mksc_shrn_iscd: z.string(),
  hts_kor_isnm: z.string(),
  stck_prpr: z.string(),
  prdy_vrss: z.string(),
  prdy_ctrt: z.string(),
  prdy_vrss_sign: z.string(),
  data_rank: z.string(),
  acml_vol: z.string(),
  acml_tr_pbmn: z.string(),
});

// FID_INPUT_CNT_1 는 "행 개수"가 아니라 조건 필드. probe 실측상 "30"을 넣으면 상위 리스트가
// 오염되어 부호가 뒤섞이는 결과로 나온다. "0"으로 두는 것이 정상 상승/하락률순 정렬.
const buildFluctuationParams = (
  direction: "up" | "down",
  market: Market,
): Record<string, string> => ({
  FID_COND_MRKT_DIV_CODE: "J",
  FID_COND_SCR_DIV_CODE: "20170",
  FID_INPUT_ISCD: MARKET_TO_ISCD[market],
  FID_RANK_SORT_CLS_CODE: direction === "up" ? "0" : "1",
  FID_INPUT_CNT_1: "0",
  FID_PRC_CLS_CODE: "1",
  FID_INPUT_PRICE_1: "",
  FID_INPUT_PRICE_2: "",
  FID_VOL_CNT: "",
  FID_TRGT_CLS_CODE: "0",
  FID_TRGT_EXLS_CLS_CODE: TRGT_EXLS_CODE,
  FID_DIV_CLS_CODE: "0",
  FID_RSFL_RATE1: "",
  FID_RSFL_RATE2: "",
});

const buildVolumeParams = (
  by: "volume" | "value",
  market: Market,
): Record<string, string> => ({
  FID_COND_MRKT_DIV_CODE: "J",
  FID_COND_SCR_DIV_CODE: "20171",
  FID_INPUT_ISCD: MARKET_TO_ISCD[market],
  FID_DIV_CLS_CODE: "0",
  FID_BLNG_CLS_CODE: by === "volume" ? "0" : "3",
  FID_TRGT_CLS_CODE: "111111111",
  FID_TRGT_EXLS_CLS_CODE: TRGT_EXLS_CODE,
  FID_INPUT_PRICE_1: "",
  FID_INPUT_PRICE_2: "",
  FID_VOL_CNT: "",
  FID_INPUT_DATE_1: "",
});

const resolveRequest = (
  kind: MarketRankingKind,
): { path: string; trId: string; params: Record<string, string> } =>
  kind.kind === "fluctuation"
    ? {
        path: FLUCTUATION_PATH,
        trId: TR_ID_FLUCTUATION,
        params: buildFluctuationParams(kind.direction, kind.market),
      }
    : {
        path: VOLUME_PATH,
        trId: TR_ID_VOLUME,
        params: buildVolumeParams(kind.by, kind.market),
      };

// 종목코드 필드가 endpoint 별로 다르다: fluctuation=stck_shrn_iscd, volume=mksc_shrn_iscd.
// 개별 row 파싱 실패는 null → 상위에서 drop. 부분 실패가 전체 실패로 번지지 않도록.
const normalizeRow = (
  raw: unknown,
  kind: MarketRankingKind,
): MarketRankingItem | null => {
  if (kind.kind === "fluctuation") {
    const parsed = FluctuationRowSchema.safeParse(raw);
    if (!parsed.success) return null;
    const d = parsed.data;
    return {
      ticker: d.stck_shrn_iscd,
      name: d.hts_kor_isnm,
      price: Number(d.stck_prpr),
      change: Number(d.prdy_vrss),
      changePct: Number(d.prdy_ctrt),
      changeSign: d.prdy_vrss_sign,
      rank: Number(d.data_rank),
      volume: Number(d.acml_vol),
    };
  }
  const parsed = VolumeRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    ticker: d.mksc_shrn_iscd,
    name: d.hts_kor_isnm,
    price: Number(d.stck_prpr),
    change: Number(d.prdy_vrss),
    changePct: Number(d.prdy_ctrt),
    changeSign: d.prdy_vrss_sign,
    rank: Number(d.data_rank),
    volume: Number(d.acml_vol),
    tradeValue: Number(d.acml_tr_pbmn),
  };
};

// 1콜당 최대 30행 그대로 반환. slice / 카테고리 라벨링은 상위 계층에서.
export const fetchRanking = async (
  kind: MarketRankingKind,
): Promise<RankingFetchResult> => {
  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis-ranking] token failed: ${tokenResult.error.kind}`);
    return { ok: false, error: { kind: "token_failed" } };
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis-ranking] missing credentials");
    return { ok: false, error: { kind: "missing_credentials" } };
  }

  const { path, trId, params } = resolveRequest(kind);
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: trId,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis-ranking] HTTP ${res.status} kind=${kind.kind}`);
      return { ok: false, error: { kind: "http_error", status: res.status } };
    }

    const json: unknown = await res.json();
    const parsed = KisEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[kis-ranking] response envelope parse failed");
      return { ok: false, error: { kind: "parse_error" } };
    }

    if (parsed.data.rt_cd !== "0") {
      const message = parsed.data.msg1 ?? "";
      console.error(
        `[kis-ranking] business error rt_cd=${parsed.data.rt_cd} msg=${message}`,
      );
      return { ok: false, error: { kind: "business_error", message } };
    }

    const rows = parsed.data.output ?? [];
    const items = rows
      .map((row) => normalizeRow(row, kind))
      .filter((x): x is MarketRankingItem => x !== null);

    return { ok: true, items };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis-ranking] fetch failed: ${message}`);
    return { ok: false, error: { kind: "network_error", message } };
  }
};
