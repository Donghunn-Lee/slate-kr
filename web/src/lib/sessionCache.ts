import type { KrxSession, UsSession } from "@/shared/utils/market";

// 지수·랭킹 route 공통 TTL. session·tradingDate 를 cache key 축으로 넣어
// 세션·일 경계에서 자동 miss 를 보장한 다음, TTL 은 최소한만 남긴다.
// regular 60s = 클라 폴링(60s) 과 정렬. 그 외 세션은 폴링 없음 → 3600s 로 KIS 부담 최소화.
// stock-intraday(F41) 는 활성 세션(after/pre) 폴링을 유지하는 별 정책이라
// 여기 편입하지 않는다 — 각 route 소유.
export const krxIndexRankingRevalidate = (session: KrxSession): number =>
  session === "regular" ? 60 : 3600;

// 해외 지수 intraday. 라이브 자체가 ~15분 지연 피드라 국내 60s 보다 완만한 120s.
// closed 는 국내와 동일한 3600s.
export const usOverseasIntradayRevalidate = (session: UsSession): number =>
  session === "regular" ? 120 : 3600;
