import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchDisclosureText } from "@/lib/dart-document";
import { summarizeDisclosure } from "@/lib/disclosure-summary";
import { getDisclosureSummary, saveDisclosureSummary } from "@/lib/disclosure-summaries";
import { classifyDisclosure, DisclosureType } from "@/shared/utils/classifyDisclosure";

const RequestBodySchema = z.object({
  rcept_no: z.string().min(1),
  disclosure_nm: z.string().min(1),
  flr_nm: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { kind: "invalid_request" } }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { kind: "invalid_request" } }, { status: 400 });
  }

  const { rcept_no, disclosure_nm, flr_nm } = parsed.data;

  let cached: Awaited<ReturnType<typeof getDisclosureSummary>>;
  try {
    cached = await getDisclosureSummary(rcept_no);
  } catch {
    return NextResponse.json({ ok: false, error: { kind: "api_error", message: "DB 조회 실패" } });
  }
  if (cached) {
    return NextResponse.json({ ok: true, content: cached.content });
  }

  // 클라이언트가 1차로 게이팅한다. 여기서는 FINANCIAL 만 2차 방어선으로 남긴다.
  if (classifyDisclosure(disclosure_nm, flr_nm) === DisclosureType.FINANCIAL) {
    return NextResponse.json({ ok: false, error: { kind: "not_summarizable" } });
  }

  let docResult: Awaited<ReturnType<typeof fetchDisclosureText>>;
  try {
    docResult = await fetchDisclosureText(rcept_no);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: { kind: "api_error", message } });
  }

  if (!docResult.ok) {
    return NextResponse.json({ ok: false, error: docResult.error });
  }

  const result = await summarizeDisclosure(docResult.text);

  if (result.ok) {
    try {
      await saveDisclosureSummary({
        rceptNo: rcept_no,
        content: result.content,
        modelName: result.modelName,
      });
    } catch {
      // 캐시 저장 실패는 요약 반환에 영향 주지 않음
    }
    return NextResponse.json({ ok: true, content: result.content });
  }

  return NextResponse.json({ ok: false, error: result.error });
}
