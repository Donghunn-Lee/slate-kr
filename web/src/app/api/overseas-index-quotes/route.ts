import { revalidateTag, unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { fetchOverseasIndexQuote } from "@/lib/overseas-index-source";
import { applyDemoFault } from "@/lib/demo-fault";
import {
  INDEX_LABEL,
  OVERSEAS_INDEX_CODES,
  OVERSEAS_INTRADAY_CODES,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import {
  getGlobalOverseasSessionState,
  getKstDateAndMinutes,
  isGlobalOverseasActive,
  type GlobalOverseasSession,
} from "@/shared/utils/market";
import { globalOverseasQuoteRevalidate } from "@/lib/session-cache";
import type { IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 코드 × 글로벌세션 × KST일자 별 unstable_cache 래퍼 memoize.
// session·date 를 key 축으로 넣어 세션·일 경계 자동 miss.
// active 60s / idle 3600s (US 마감 45분 후 ~ KST 09:00 만 idle). null(호출 실패) 도 캐시되므로
// 실패 시 tag evict 로 stale null 재서빙 방지.
// 캐시 단위 = 시세 + 조립 시각 (index-quotes 와 같은 모양). fetchedAt 을 이 안에서 캡처해야
// SWR 히트 시 원 조립 시각이 그대로 실려 클라가 stale 응답을 판정할 수 있다.
type CachedOverseasQuote = { live: IndexQuote | null; fetchedAt: number };
type OverseasQuoteFetcher = () => Promise<CachedOverseasQuote>;
const quoteFetchers = new Map<string, OverseasQuoteFetcher>();

// Data Cache 는 배포를 넘어 남는다 — 캐시 값(CachedOverseasQuote) 형태가 바뀌면 이 버전을 올려
// 이전 형태로 저장된 엔트리를 새 코드가 읽지 않게 한다.
const CACHE_SHAPE_VERSION = "v2";

const cacheKeyOf = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  date: string
): string => `${code}::${session}::${date}`;

const cacheTagOf = (code: OverseasIndexCode, session: GlobalOverseasSession): string =>
  `overseas-index-quote-${code}-${session}`;

const getCachedQuote = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  date: string
): OverseasQuoteFetcher => {
  const key = cacheKeyOf(code, session, date);
  const cached = quoteFetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    async () => {
      const live = await fetchOverseasIndexQuote(code, INDEX_LABEL[code]);
      return { live, fetchedAt: Date.now() } satisfies CachedOverseasQuote;
    },
    ["overseas-index-quote", CACHE_SHAPE_VERSION, code, session, date],
    {
      revalidate: globalOverseasQuoteRevalidate(session),
      tags: [cacheTagOf(code, session)],
    }
  );
  quoteFetchers.set(key, fresh);
  return fresh;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

// null 실패 신호 시 세션 tag evict — index-quotes route 와 동형.
const resolveCell = (
  code: OverseasIndexCode,
  session: GlobalOverseasSession,
  r: PromiseSettledResult<CachedOverseasQuote>
): CachedOverseasQuote | null => {
  const value = pick(r);
  if (value === null || value.live === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
  }
  return value;
};

export const GET = async (req: NextRequest) => {
  const session = getGlobalOverseasSessionState();
  const date = getKstDateAndMinutes().date;

  try {
    await applyDemoFault(req);
    // 현재가 조회는 intraday 화이트리스트만. .DJI 는 daily-only 지수라 호출 없이 null
    // (소비측은 일봉 폴백).
    const results = await Promise.allSettled(
      OVERSEAS_INTRADAY_CODES.map((code) => getCachedQuote(code, session, date)())
    );
    const cells = OVERSEAS_INTRADAY_CODES.map((code, i) => resolveCell(code, session, results[i]));
    const live = Object.fromEntries(
      OVERSEAS_INTRADAY_CODES.map((code, i) => [code, cells[i]?.live ?? null])
    ) as Partial<Record<OverseasIndexCode, IndexQuote | null>>;

    const quotes = Object.fromEntries(
      OVERSEAS_INDEX_CODES.map((code) => [code, live[code] ?? null])
    ) as Record<OverseasIndexCode, IndexQuote | null>;

    // active 셀 중 가장 오래된 조립 시각 — 클라 stale 판정 축. idle 은 TTL 3600s 라 판정 대상이
    // 아니므로 null. 조회 실패 셀(live null)은 축출돼 다음 요청이 새로 조립하므로 제외.
    const cellTimes = cells.flatMap((c) => (c === null || c.live === null ? [] : [c.fetchedAt]));
    const fetchedAt = session === "active" && cellTimes.length > 0 ? Math.min(...cellTimes) : null;

    return NextResponse.json({
      quotes,
      active: isGlobalOverseasActive(),
      date,
      fetchedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overseas-index-quotes] ${message}`);
    return NextResponse.json({ error: "해외 지수 시세를 불러오지 못했습니다" }, { status: 500 });
  }
};
