import { z } from "zod";
import type {
  IndexQuote,
  MarketActionStatus,
  PriceSign,
  StockQuote,
} from "@/shared/types/quote";

// KIS prdy_vrss_sign: 1=상한, 2=상승, 3=보합, 4=하한, 5=하락
const toSign = (code: string): PriceSign =>
  code === "3" ? "flat" : code === "1" || code === "2" ? "up" : "down";

const StockQuoteSchema = z.object({
  stck_shrn_iscd: z.string(),
  stck_prpr: z.string(),
  prdy_vrss: z.string(),
  prdy_ctrt: z.string(),
  prdy_vrss_sign: z.string(),
  stck_oprc: z.string(),
  stck_hgpr: z.string(),
  stck_lwpr: z.string(),
  acml_vol: z.string(),
  // KIS 는 병합·상장폐지 등으로 시세가 축소된 응답에서 아래 필드들을 결측시킨다.
  // safeParse 를 유지하기 위해 optional. temp_stop_yn 은 관측용으로 스키마에만 포함.
  iscd_stat_cls_code: z.string().optional(),
  mrkt_warn_cls_code: z.string().optional(),
  mang_issu_cls_code: z.string().optional(),
  sltr_yn: z.string().optional(),
  temp_stop_yn: z.string().optional(),
});

// 시세 축소 응답에서는 stck_shrn_iscd 등 기본 필드도 결측되므로 permissive 스키마로
// safeParse 를 통과시켜 unavailable 판정 근거를 확보한다.
const MarketActionSchema = z.object({
  stck_prpr: z.string().optional(),
  iscd_stat_cls_code: z.string().optional(),
  mrkt_warn_cls_code: z.string().optional(),
  mang_issu_cls_code: z.string().optional(),
  sltr_yn: z.string().optional(),
});

const MultiQuoteSchema = z.object({
  inter_shrn_iscd: z.string(),
  inter2_prpr: z.string(),
  inter2_prdy_vrss: z.string(),
  prdy_ctrt: z.string(),
  prdy_vrss_sign: z.string(),
  inter2_oprc: z.string(),
  inter2_hgpr: z.string(),
  inter2_lwpr: z.string(),
  acml_vol: z.string(),
});

const IndexQuoteSchema = z.object({
  bstp_nmix_prpr: z.string(),
  bstp_nmix_prdy_vrss: z.string(),
  bstp_nmix_prdy_ctrt: z.string(),
  prdy_vrss_sign: z.string(),
  bstp_nmix_oprc: z.string(),
  bstp_nmix_hgpr: z.string(),
  bstp_nmix_lwpr: z.string(),
  ascn_issu_cnt: z.string(),
  down_issu_cnt: z.string(),
});

export const normalizeStockQuote = (raw: unknown): StockQuote | null => {
  const parsed = StockQuoteSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const price = Number(d.stck_prpr);
  // KIS 가 정지·축소 응답에 prpr=0 을 반환하는 경우 EOD 표시를 0 으로 덮지
  // 않도록 null 로 강등. NaN 도 동일 취급.
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    ticker: d.stck_shrn_iscd,
    price,
    change: Number(d.prdy_vrss),
    changeRate: Number(d.prdy_ctrt),
    sign: toSign(d.prdy_vrss_sign),
    open: Number(d.stck_oprc),
    high: Number(d.stck_hgpr),
    low: Number(d.stck_lwpr),
    volume: Number(d.acml_vol),
  };
};

// KIS FHKST01010100 output → 시장조치 상태 (순수 함수).
// 판정 우선순위(첫 매치 하나만):
//   1. iscd_stat_cls_code = "58"          → suspended (거래정지)
//   2. sltr_yn            = "Y"           → liquidation (정리매매)
//   3. mang_issu_cls_code = "Y"           → managed (관리종목)
//   4. iscd_stat_cls_code = "59"          → overheated (단기과열)
//   5. mrkt_warn_cls_code ∈ {01,02,03}    → caution / warning / risk
//   6. stck_prpr=0 && mrkt_warn/mang/sltr 전부 결측 → unavailable (응답 축소)
//   7. 그 외 → null
// iscd_stat_cls_code 는 58/59 외 판정에 사용하지 않는다 — 관리 판정은 mang 필드로만.
export const parseMarketAction = (raw: unknown): MarketActionStatus | null => {
  const parsed = MarketActionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;

  if (d.iscd_stat_cls_code === "58") return { kind: "suspended" };
  if (d.sltr_yn === "Y") return { kind: "liquidation" };
  if (d.mang_issu_cls_code === "Y") return { kind: "managed" };
  if (d.iscd_stat_cls_code === "59") return { kind: "overheated" };
  if (d.mrkt_warn_cls_code === "01") return { kind: "caution" };
  if (d.mrkt_warn_cls_code === "02") return { kind: "warning" };
  if (d.mrkt_warn_cls_code === "03") return { kind: "risk" };

  // 응답 축소 감지 — 원인 단정 없이 "판정 근거 부재 + 가격 0" 사실만 신호.
  const priceZero = d.stck_prpr !== undefined && Number(d.stck_prpr) === 0;
  const actionFieldsAbsent =
    d.mrkt_warn_cls_code === undefined &&
    d.mang_issu_cls_code === undefined &&
    d.sltr_yn === undefined;
  if (priceZero && actionFieldsAbsent) return { kind: "unavailable" };

  return null;
};

export const normalizeMultiQuote = (raw: unknown): StockQuote | null => {
  const parsed = MultiQuoteSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    ticker: d.inter_shrn_iscd,
    price: Number(d.inter2_prpr),
    change: Number(d.inter2_prdy_vrss),
    changeRate: Number(d.prdy_ctrt),
    sign: toSign(d.prdy_vrss_sign),
    open: Number(d.inter2_oprc),
    high: Number(d.inter2_hgpr),
    low: Number(d.inter2_lwpr),
    volume: Number(d.acml_vol),
  };
};

export const normalizeIndexQuote = (raw: unknown, name: string): IndexQuote | null => {
  const parsed = IndexQuoteSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    name,
    price: Number(d.bstp_nmix_prpr),
    change: Number(d.bstp_nmix_prdy_vrss),
    changeRate: Number(d.bstp_nmix_prdy_ctrt),
    sign: toSign(d.prdy_vrss_sign),
    open: Number(d.bstp_nmix_oprc),
    high: Number(d.bstp_nmix_hgpr),
    low: Number(d.bstp_nmix_lwpr),
    advCount: Number(d.ascn_issu_cnt),
    declCount: Number(d.down_issu_cnt),
    // 국내 지수 quote 응답에는 체결시각 필드 없음 — 라벨은 클라 시계로 조립.
    time: null,
  };
};
