import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchDisclosureText } from "@/lib/dart-document";
import { summarizeDisclosure } from "@/lib/disclosure-summary";
import { getDisclosureSummary, saveDisclosureSummary } from "@/lib/disclosure-summaries";
import { classifyDisclosure, DisclosureType } from "@/shared/utils/classifyDisclosure";

const RequestBodySchema = z.object({
  rcept_no: z.string().min(1),
  disclosure_nm: z.string().min(1),
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

  const { rcept_no, disclosure_nm } = parsed.data;

  const cached = await getDisclosureSummary(rcept_no);
  if (cached) {
    return NextResponse.json({ ok: true, summary: cached.summaryText });
  }

  if (classifyDisclosure(disclosure_nm) === DisclosureType.FINANCIAL) {
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
    await saveDisclosureSummary({
      rceptNo: rcept_no,
      summaryText: result.summary,
      modelName: result.modelName,
    });
    return NextResponse.json({ ok: true, summary: result.summary });
  }

  return NextResponse.json({ ok: false, error: result.error });
}
