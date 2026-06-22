import { z } from "zod";
import type { IndexQuote, PriceSign, StockQuote } from "@/shared/types/quote";

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
  return {
    ticker: d.stck_shrn_iscd,
    price: Number(d.stck_prpr),
    change: Number(d.prdy_vrss),
    changeRate: Number(d.prdy_ctrt),
    sign: toSign(d.prdy_vrss_sign),
    open: Number(d.stck_oprc),
    high: Number(d.stck_hgpr),
    low: Number(d.stck_lwpr),
    volume: Number(d.acml_vol),
  };
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
  };
};
