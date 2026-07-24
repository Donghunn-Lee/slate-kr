import { type NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/stocks";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const parseIntParam = (raw: string | null): { ok: true; value: number | null } | { ok: false } => {
  if (raw === null) return { ok: true, value: null };
  if (!/^-?\d+$/.test(raw)) return { ok: false };
  return { ok: true, value: Number.parseInt(raw, 10) };
};

export const GET = async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (q.trim() === "") {
    return NextResponse.json({ results: [], hasMore: false });
  }

  const limitRaw = parseIntParam(request.nextUrl.searchParams.get("limit"));
  const offsetRaw = parseIntParam(request.nextUrl.searchParams.get("offset"));

  if (!limitRaw.ok || !offsetRaw.ok) {
    return NextResponse.json({ error: "Invalid pagination params" }, { status: 400 });
  }

  const limitParsed = limitRaw.value ?? DEFAULT_LIMIT;
  const offsetParsed = offsetRaw.value ?? 0;

  if (limitParsed < 1 || offsetParsed < 0) {
    return NextResponse.json({ error: "Invalid pagination params" }, { status: 400 });
  }

  const limit = Math.min(limitParsed, MAX_LIMIT);

  try {
    const page = await searchStocks(q, { limit, offset: offsetParsed });
    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
