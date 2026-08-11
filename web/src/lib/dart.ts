import { cache } from "react";
import { z } from "zod";
import type { CompanyProfile, DartDisclosure } from "@/shared/types/stock";
import { getSectorName } from "@/shared/utils/ksic";

const DartItemSchema = z.object({
  corp_name: z.string(),
  report_nm: z.string(),
  rcept_no: z.string(),
  flr_nm: z.string(),
  rcept_dt: z.string(),
  rm: z.string(),
});

const DartResponseSchema = z.object({
  status: z.string(),
  list: z.array(DartItemSchema).optional(),
  total_count: z.coerce.number().optional(),
  total_page: z.coerce.number().optional(),
});

export type DisclosuresResult = {
  items: DartDisclosure[];
  totalCount: number;
  totalPage: number;
  currentPage: number;
};

export type GetDisclosuresOptions = {
  pageNo?: number;
  pageCount?: number;
  bgnDate?: Date;
  endDate?: Date;
};

const toYyyymmdd = (date: Date): string =>
  date.toISOString().slice(0, 10).replace(/-/g, "");

export const getDisclosures = cache(
  async (
    corpCode: string,
    options: GetDisclosuresOptions = {},
  ): Promise<DisclosuresResult> => {
    const apiKey = process.env.DART_API_KEY;
    const { pageNo = 1, pageCount = 100, bgnDate, endDate } = options;

    const empty: DisclosuresResult = {
      items: [],
      totalCount: 0,
      totalPage: 0,
      currentPage: pageNo,
    };

    if (!apiKey || !corpCode) return empty;

    const url = new URL("https://opendart.fss.or.kr/api/list.json");
    url.searchParams.set("crtfc_key", apiKey);
    url.searchParams.set("corp_code", corpCode);
    url.searchParams.set("page_no", String(pageNo));
    url.searchParams.set("page_count", String(pageCount));
    url.searchParams.set("last_reprt_at", "Y");
    if (bgnDate) url.searchParams.set("bgn_de", toYyyymmdd(bgnDate));
    if (endDate) url.searchParams.set("end_de", toYyyymmdd(endDate));

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`DART HTTP 오류: ${res.status}`);

    const json: unknown = await res.json();
    const parsed = DartResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("DART 응답 파싱 실패");

    const { status } = parsed.data;
    if (status === "013") return empty;
    if (status !== "000") throw new Error(`DART API 오류: ${status}`);

    const items: DartDisclosure[] = (parsed.data.list ?? []).map((item) => ({
      rcpNo: item.rcept_no,
      disclosureNm: item.report_nm,
      corpName: item.corp_name,
      flrNm: item.flr_nm,
      rcptDt: item.rcept_dt,
      rmk: item.rm,
    }));

    return {
      items,
      totalCount: parsed.data.total_count ?? items.length,
      totalPage: parsed.data.total_page ?? (items.length > 0 ? 1 : 0),
      currentPage: pageNo,
    };
  },
);

const CompanyResponseSchema = z.object({
  status: z.string(),
  induty_code: z.string().optional(),
  hm_url: z.string().optional(),
});

export const getCompanyProfile = cache(
  async (corpCode: string): Promise<CompanyProfile | null> => {
    const apiKey = process.env.DART_API_KEY;
    if (!apiKey || !corpCode) return null;

    const url = new URL("https://opendart.fss.or.kr/api/company.json");
    url.searchParams.set("crtfc_key", apiKey);
    url.searchParams.set("corp_code", corpCode);

    try {
      const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
      if (!res.ok) return null;

      const json: unknown = await res.json();
      const parsed = CompanyResponseSchema.safeParse(json);
      if (!parsed.success) return null;
      if (parsed.data.status !== "000") return null;

      const sectorName = getSectorName(parsed.data.induty_code);
      const rawUrl = parsed.data.hm_url?.trim();
      const homepageUrl = rawUrl
        ? rawUrl.startsWith("http")
          ? rawUrl
          : `https://${rawUrl}`
        : null;

      return { sectorName, homepageUrl };
    } catch {
      return null;
    }
  },
);
