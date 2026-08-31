import { unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { getIndexDailyPrices } from "@/lib/indices";
import { INDEX_CODES, type IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 지수 1종의 전량 일봉을 서빙. 지수 코드 별 unstable_cache 래퍼 memoize —
// SSR ISR(3600s) 와 동일 revalidate.
type Fetcher = () => Promise<IndexDailySnapshot[]>;
const fetchers = new Map<IndexCode, Fetcher>();

const getCachedFetcher = (code: IndexCode): Fetcher => {
  const cached = fetchers.get(code);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getIndexDailyPrices(code),
    ["index-daily", code],
    { revalidate: 3600 },
  );
  fetchers.set(code, fresh);
  return fresh;
};

const isIndexCode = (raw: string): raw is IndexCode =>
  (INDEX_CODES as readonly string[]).includes(raw);

export const GET = async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("code");
  if (!raw || !isIndexCode(raw)) {
    return NextResponse.json(
      { error: "유효하지 않은 지수 코드입니다" },
      { status: 400 },
    );
  }

  try {
    const snapshots = await getCachedFetcher(raw)();
    return NextResponse.json(snapshots);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[index-daily] ${raw}: ${message}`);
    return NextResponse.json(
      { error: "일봉 데이터를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
