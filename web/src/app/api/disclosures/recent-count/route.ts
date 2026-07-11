import { NextRequest, NextResponse } from "next/server";
import { getCorpCode } from "@/lib/stocks";
import { getDisclosures } from "@/lib/dart";

export type TickerDisclosureCount = {
  ticker: string;
  count: number | null;
};

const MAX_TICKERS = 30;
const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

// GET /api/disclosures/recent-count?tickers=005930,000660&days=7
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json([]);
  }

  const daysRaw = req.nextUrl.searchParams.get("days");
  const days = daysRaw === null ? DEFAULT_DAYS : Number(daysRaw);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    return NextResponse.json(
      { error: `days는 ${MIN_DAYS}~${MAX_DAYS} 범위의 정수여야 합니다` },
      { status: 400 }
    );
  }

  try {
    const bgnDate = new Date();
    bgnDate.setDate(bgnDate.getDate() - days);

    const results = await Promise.allSettled(
      tickers.map(async (ticker): Promise<number | null> => {
        const corpCode = await getCorpCode(ticker);
        if (!corpCode) return null;
        const result = await getDisclosures(corpCode, { pageNo: 1, pageCount: 1, bgnDate });
        return result.totalCount;
      })
    );

    const response: TickerDisclosureCount[] = results.map((r, i) => ({
      ticker: tickers[i],
      count: r.status === "fulfilled" ? r.value : null,
    }));

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "공시 카운트를 불러오지 못했습니다" }, { status: 500 });
  }
}
