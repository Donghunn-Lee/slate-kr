import { z } from "zod";
import { getKisToken } from "@/lib/kis-token";
import type { ChartBar } from "@/shared/types/quote";

// KIS 해외지수 1분봉 (FHKST03030200) 라이브 fetch.
// 지수 국내 스키마(bstp_nmix_*) 재사용 금지 — 해외는 optn_* 접두라 별도 정의.
// 응답 값은 문자열이지만 z.coerce.number 로 캐스팅.
// 응답 시각은 ET 로컬 naive → kstToFakeUtcSec 와 동일 트릭으로 fake-UTC 인코딩
// (Date.UTC 로 위장하면 lightweight-charts 가로축이 그 값을 그대로 라벨링).

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const INTRADAY_PATH =
  "/uapi/overseas-price/v1/quotations/inquire-time-indexchartprice";
const TR_ID_OVERSEAS_INTRADAY = "FHKST03030200";

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
export const fetchOverseasIndexIntradayChart = async (
  iscd: string,
): Promise<ChartBar[] | null> => {
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
