import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchOverseasIndexQuote } from "@/lib/kis-overseas-quote-fetch";
import {
  INDEX_LABEL,
  OVERSEAS_INDEX_CODES,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import {
  getGlobalOverseasSessionState,
  getKstDateAndMinutes,
  isGlobalOverseasActive,
  type GlobalOverseasSession,
} from "@/shared/utils/market";
import { globalOverseasQuoteRevalidate } from "@/lib/sessionCache";
import type { IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 코드 × 글로벌세션 × KST일자 별 unstable_cache 래퍼 memoize.
// F42 패턴 이식: session·date 를 key 축으로 넣어 세션·일 경계 자동 miss.
// active 60s / idle 3600s (KST 05:00~09:00 만 idle). null(호출 실패) 도 캐시되므로
// 실패 시 tag evict 로 stale null 재서빙 방지.
type OverseasQuoteFetcher = () => Promise<IndexQuote | null>;
const quoteFetchers = new Map<string, OverseasQuoteFetcher>();

const cacheKeyOf = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  date: string,
): string => `${code}::${session}::${date}`;

const cacheTagOf = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
): string => `overseas-index-quote-${code}-${session}`;

const getCachedQuote = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  date: string,
): OverseasQuoteFetcher => {
  const key = cacheKeyOf(code, session, date);
  const cached = quoteFetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => fetchOverseasIndexQuote(code, INDEX_LABEL[code]),
    ["overseas-index-quote", code, session, date],
    {
      revalidate: globalOverseasQuoteRevalidate(session),
      tags: [cacheTagOf(code, session)],
    },
  );
  quoteFetchers.set(key, fresh);
  return fresh;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

// null 실패 신호 시 세션 tag evict — index-quotes route 와 동형.
const resolveLive = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  r: PromiseSettledResult<IndexQuote | null>,
): IndexQuote | null => {
  const value = pick(r);
  if (value === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
  }
  return value;
};

export const GET = async () => {
  const session = getGlobalOverseasSessionState();
  const date = getKstDateAndMinutes().date;

  try {
    const results = await Promise.allSettled(
      OVERSEAS_INDEX_CODES.map((code) =>
        getCachedQuote(code, session, date)(),
      ),
    );

    const quotes = Object.fromEntries(
      OVERSEAS_INDEX_CODES.map((code, i) => [
        code,
        resolveLive(code, session, results[i]),
      ]),
    ) as Record<OverseasIndexCode, IndexQuote | null>;

    return NextResponse.json({
      quotes,
      active: isGlobalOverseasActive(),
      date,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overseas-index-quotes] ${message}`);
    return NextResponse.json(
      { error: "해외 지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
