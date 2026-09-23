import { NextRequest, NextResponse } from "next/server";
import { getPriceSummariesByTickers } from "@/lib/prices";

// GET /api/prices?tickers=005930,000660,035420
export const GET = async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20); // 최대 20개

  if (tickers.length === 0) {
    return NextResponse.json([]);
  }

  try {
    const response = await getPriceSummariesByTickers(tickers);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "가격 데이터를 불러오지 못했습니다" }, { status: 500 });
  }
};
