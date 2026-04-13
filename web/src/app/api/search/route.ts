import { type NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/stocks";

export const GET = async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (q.trim() === "") {
    return NextResponse.json([]);
  }

  try {
    const results = await searchStocks(q);
    const body = results.map(({ ticker, name, market }) => ({ ticker, name, market }));
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
