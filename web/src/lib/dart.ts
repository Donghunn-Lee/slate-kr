import { z } from "zod";
import type { DartDisclosure } from "@/shared/types/stock";

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
});

export const getDisclosures = async (corpCode: string, limit = 10): Promise<DartDisclosure[]> => {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey || !corpCode) return [];

  const bgnDate = new Date();
  bgnDate.setMonth(bgnDate.getMonth() - 3);
  const bgnDe = bgnDate.toISOString().slice(0, 10).replace(/-/g, "");

  const url = new URL("https://opendart.fss.or.kr/api/list.json");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bgn_de", bgnDe);
  url.searchParams.set("page_no", "1");
  url.searchParams.set("page_count", String(limit));

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`DART HTTP 오류: ${res.status}`);

  const json: unknown = await res.json();
  const parsed = DartResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("DART 응답 파싱 실패");

  const { status } = parsed.data;
  if (status === "013") return []; // 조회된 데이터 없음 (정상 empty)
  if (status !== "000") throw new Error(`DART API 오류: ${status}`);

  return (parsed.data.list ?? []).map((item) => ({
    rcpNo: item.rcept_no,
    disclosureNm: item.report_nm,
    corpName: item.corp_name,
    flrNm: item.flr_nm,
    rcptDt: item.rcept_dt,
    rmk: item.rm,
  }));
};
