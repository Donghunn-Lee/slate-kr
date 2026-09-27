import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findDisclosure } from "@/lib/dart";
import { fetchDisclosureText } from "@/lib/dart-document";
import { summarizeDisclosure } from "@/lib/disclosure-summary";
import { getDisclosureSummary, saveDisclosureSummary } from "@/lib/disclosure-summaries";
import { getCorpCode } from "@/lib/stocks";
import { TickerSchema } from "@/shared/types/schemas";
import type { DartDisclosure } from "@/shared/types/stock";
import { classifyDisclosure, DisclosureType } from "@/shared/utils/classifyDisclosure";

// summarizeDisclosure의 요청 예산(55s)을 담는 함수 상한. 미지정이면 배포 플랫폼 기본값에 달린다.
export const maxDuration = 60;

const RequestBodySchema = z.object({
  rcept_no: z.string().regex(/^\d{14}$/),
  ticker: TickerSchema,
});

export const POST = async (req: NextRequest) => {
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

  const { rcept_no, ticker } = parsed.data;

  let cached: Awaited<ReturnType<typeof getDisclosureSummary>>;
  try {
    cached = await getDisclosureSummary(rcept_no);
  } catch {
    return NextResponse.json({ ok: false, error: { kind: "api_error", message: "DB 조회 실패" } });
  }
  if (cached) {
    return NextResponse.json({ ok: true, content: cached.content });
  }

  // 제목·회사명은 프롬프트를 거쳐 공유 캐시에 남으므로 클라이언트 값을 받지 않고 DART 목록에서 찾는다.
  let corpCode: string | null;
  try {
    corpCode = await getCorpCode(ticker);
  } catch {
    return NextResponse.json({ ok: false, error: { kind: "api_error", message: "DB 조회 실패" } });
  }

  let disclosure: DartDisclosure | null;
  try {
    disclosure = corpCode ? await findDisclosure(corpCode, rcept_no) : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: { kind: "api_error", message } });
  }
  if (!disclosure) {
    return NextResponse.json({ ok: false, error: { kind: "invalid_request" } }, { status: 400 });
  }

  // 클라이언트가 1차로 게이팅한다. 여기서는 FINANCIAL 만 2차 방어선으로 남긴다.
  if (classifyDisclosure(disclosure.disclosureNm, disclosure.flrNm) === DisclosureType.FINANCIAL) {
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

  const result = await summarizeDisclosure(docResult.text, {
    title: disclosure.disclosureNm,
    corpName: disclosure.corpName,
  });

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
};
