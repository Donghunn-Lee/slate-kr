import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import type {
  ChartBar,
  IndexQuote,
  PriceSign,
} from "@/shared/types/quote";
import type { OverseasIndexCode } from "@/shared/constants/indices";

// KIS 해외지수 1분봉 (FHKST03030200) 라이브 fetch.
// 지수 국내 스키마(bstp_nmix_*) 재사용 금지 — 해외는 optn_* 접두라 별도 정의.
// 응답 값은 문자열이지만 z.coerce.number 로 캐스팅.
// 응답 시각은 ET 로컬 naive → kstToFakeUtcSec 와 동일 트릭으로 fake-UTC 인코딩
// (Date.UTC 로 위장하면 lightweight-charts 가로축이 그 값을 그대로 라벨링).

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INTRADAY_PATH =
  "/uapi/overseas-price/v1/quotations/inquire-time-indexchartprice";
const TR_ID_OVERSEAS_INTRADAY = "FHKST03030200";

// 도메인 index_code → KIS iscd. collector/fetch_overseas_indices.py DOMAIN_TO_ISCD 와
// 1:1 정합 — 도메인 코드는 정규화 표기, KIS 심볼(#, alnum)은 이 파일에 격리.
// 웹 소비측(라우트·컴포넌트)은 항상 도메인 코드로만 다룬다.
const DOMAIN_TO_ISCD: Record<OverseasIndexCode, string> = {
  SPX: "SPX",
  ".DJI": ".DJI",
  COMP: "COMP",
  NDX: "NDX",
  NI225: "JP#NI225",
  HSI: "HK#HS",
  SHCOMP: "SHANG",
  DAX: "GR#DAX",
};

const INTRADAY_MARKERS = new Set(["999999", "888888"]);

const KisOverseasIntradayResponseSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output2: z
    .array(
      z.object({
        stck_bsop_date: z.string(), // YYYYMMDD (ET 로컬)
        stck_cntg_hour: z.string(), // HHMMSS (ET 로컬, 마커: 999999/888888)
        optn_prpr: z.coerce.number(), // 종가/현재가
        optn_oprc: z.coerce.number(),
        optn_hgpr: z.coerce.number(),
        optn_lwpr: z.coerce.number(),
        // cntg_vol 은 지수 분봉에서 항상 0 이므로 무시.
      }),
    )
    .optional()
    .default([]),
});

// ET 로컬 시각을 그대로 Date.UTC 로 위장해 epoch 초로 인코딩. DST 처리 불필요
// (응답 자체가 ET 로컬이므로). 국내 kstToFakeUtcSec 와 동일 트릭 — 승격/공유하지
// 않고 co-locate 유지 (국내 fetch 파일 무접촉 원칙).
const etToFakeUtcSec = (yyyymmdd: string, hhmmss: string): number =>
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

// null = 호출 자체 실패, [] = 응답 정상이나 데이터 없음(preopen/휴장 등).
// ASC 정렬, 마커행·OHLC 전부 0인 행 제거.
// 도메인 코드 입력 → DOMAIN_TO_ISCD 로 매핑 (fetchOverseasIndexQuote 패턴과 동형).
export const fetchOverseasIndexIntradayChart = async (
  code: OverseasIndexCode,
): Promise<ChartBar[] | null> => {
  const iscd = DOMAIN_TO_ISCD[code];
  if (!iscd) {
    console.error(`[kis] unknown overseas index code: ${code}`);
    return null;
  }

  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for overseas intraday");
    return null;
  }

  const url = new URL(BASE_URL + INTRADAY_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "N");
  url.searchParams.set("FID_INPUT_ISCD", iscd);
  url.searchParams.set("FID_HOUR_CLS_CODE", "0");
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
  // FID_INPUT_HOUR_1 은 이 TR 에서 무시됨 — probe 확정. 전달 금지.

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_OVERSEAS_INTRADAY,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis] overseas intraday HTTP ${res.status} iscd=${iscd}`);
      return null;
    }

    const json: unknown = await res.json();
    const parsed = KisOverseasIntradayResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[kis] overseas intraday parse failed iscd=${iscd}`);
      return null;
    }

    if (parsed.data.rt_cd !== "0") {
      console.error(
        `[kis] overseas intraday business error iscd=${iscd} rt_cd=${parsed.data.rt_cd} msg=${parsed.data.msg1 ?? ""}`,
      );
      return null;
    }

    return parsed.data.output2
      .filter((row) => !INTRADAY_MARKERS.has(row.stck_cntg_hour))
      .filter(
        (row) =>
          !(row.optn_oprc === 0 && row.optn_hgpr === 0 && row.optn_lwpr === 0 && row.optn_prpr === 0),
      )
      .map((row) => ({
        time: etToFakeUtcSec(row.stck_bsop_date, row.stck_cntg_hour),
        open: row.optn_oprc,
        high: row.optn_hgpr,
        low: row.optn_lwpr,
        close: row.optn_prpr,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] overseas intraday fetch failed iscd=${iscd}: ${message}`);
    return null;
  }
};

// FHKST03030200 output1 = 요약(현재가/전일대비/등락률/OHLC). 8종 quote 폴링용.
// 접두: 가격류 중 open/high/low 는 ovrs_prod_*, 나머지는 ovrs_nmix_* (probe 실측).
// prdy_vrss_sign 코드는 국내와 동일 (1=상한, 2=상승, 3=보합, 4=하한, 5=하락).
// advCount/declCount 는 해외 지수에 자연 없으므로 0 고정 — 소비측(buildIndexCell 해외
// 분기와 동형) 이 이미 무시하도록 정합.
const KisOverseasIndexQuoteSummarySchema = z.object({
  ovrs_nmix_prpr: z.coerce.number(),
  ovrs_nmix_prdy_vrss: z.coerce.number(),
  prdy_ctrt: z.coerce.number(),
  prdy_vrss_sign: z.string(),
  ovrs_prod_oprc: z.coerce.number(),
  ovrs_prod_hgpr: z.coerce.number(),
  ovrs_prod_lwpr: z.coerce.number(),
});

// output2 head 1건에서 체결시각·일자만 추출. 나머지 봉 필드(optn_*)는 소비 안 함.
// 시각은 거래소 현지 로컬 (probe 실측) — 문자열 그대로 전달, 타임존 변환 금지.
// 마커 hour(999999/888888) 는 head 로 나올 가능성 낮으나 방어적으로 걸러 IndexQuote.time=null.
const KisOverseasIndexQuoteHeadSchema = z.object({
  stck_bsop_date: z.string(),
  stck_cntg_hour: z.string(),
});

const HEAD_TIME_MARKERS = new Set(["999999", "888888"]);

// output2 배열의 head(index 0) 만 검증 — 봉 전량 파싱 불필요.
export const parseHeadTime = (
  output2: unknown,
): { date: string; hour: string } | null => {
  if (!Array.isArray(output2) || output2.length === 0) return null;
  const head = KisOverseasIndexQuoteHeadSchema.safeParse(output2[0]);
  if (!head.success) return null;
  if (HEAD_TIME_MARKERS.has(head.data.stck_cntg_hour)) return null;
  return { date: head.data.stck_bsop_date, hour: head.data.stck_cntg_hour };
};

const KisOverseasQuoteResponseSchema = z.object({
  rt_cd: z.string(),
  msg1: z.string().optional(),
  output1: z.unknown(),
  output2: z.unknown().optional(),
});

const toSign = (code: string): PriceSign =>
  code === "3" ? "flat" : code === "1" || code === "2" ? "up" : "down";

// 지수 값 0/음수는 무효 — 2026-08-21 .DJI output1 전 필드 0 회귀 관측.
// 소비측(buildIndexCell)이 quote 미취득과 동일 취급하도록 null 강등.
// 특정 지수 분기 금지: KIS 회귀는 어느 지수에서든 재현될 수 있다.
export const demoteInvalidOverseasQuote = (
  quote: IndexQuote,
): IndexQuote | null => (quote.price > 0 ? quote : null);

// 도메인 코드 입력 → DOMAIN_TO_ISCD 로 매핑 → FHKST03030200 output1 파싱.
// 실패는 null 반환 (기존 패턴).
export const fetchOverseasIndexQuote = async (
  code: OverseasIndexCode,
  name: string,
): Promise<IndexQuote | null> => {
  const iscd = DOMAIN_TO_ISCD[code];
  if (!iscd) {
    console.error(`[kis] unknown overseas index code: ${code}`);
    return null;
  }

  const tokenResult = await getKisToken();
  if (!tokenResult.ok) {
    console.error(`[kis] token failed: ${tokenResult.error.kind}`);
    return null;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[kis] missing credentials for overseas index quote");
    return null;
  }

  const url = new URL(BASE_URL + INTRADAY_PATH);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "N");
  url.searchParams.set("FID_INPUT_ISCD", iscd);
  url.searchParams.set("FID_HOUR_CLS_CODE", "0");
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenResult.token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: TR_ID_OVERSEAS_INTRADAY,
        custtype: "P",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[kis] overseas quote HTTP ${res.status} iscd=${iscd}`);
      return null;
    }

    const json: unknown = await res.json();
    const envelope = KisOverseasQuoteResponseSchema.safeParse(json);
    if (!envelope.success) {
      console.error(`[kis] overseas quote envelope parse failed iscd=${iscd}`);
      return null;
    }

    if (envelope.data.rt_cd !== "0") {
      console.error(
        `[kis] overseas quote business error iscd=${iscd} rt_cd=${envelope.data.rt_cd} msg=${envelope.data.msg1 ?? ""}`,
      );
      return null;
    }

    const summary = KisOverseasIndexQuoteSummarySchema.safeParse(
      envelope.data.output1,
    );
    if (!summary.success) {
      console.error(`[kis] overseas quote output1 parse failed iscd=${iscd}`);
      return null;
    }

    const d = summary.data;
    return demoteInvalidOverseasQuote({
      name,
      price: d.ovrs_nmix_prpr,
      change: d.ovrs_nmix_prdy_vrss,
      changeRate: d.prdy_ctrt,
      sign: toSign(d.prdy_vrss_sign),
      open: d.ovrs_prod_oprc,
      high: d.ovrs_prod_hgpr,
      low: d.ovrs_prod_lwpr,
      advCount: 0,
      declCount: 0,
      time: parseHeadTime(envelope.data.output2),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis] overseas quote fetch failed iscd=${iscd}: ${message}`);
    return null;
  }
};
