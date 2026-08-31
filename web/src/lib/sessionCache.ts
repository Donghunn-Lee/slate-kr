import type {
  GlobalOverseasSession,
  KrxSession,
  OverseasIndexSessionState,
} from "@/shared/utils/market";

// 마감 후 확정 프린트가 도달할 때까지 짧은 TTL 을 유지할 창의 폭(분).
// 국내 15분 = KRX 지수 15:30~45 정산 프린트. 해외 45분 = 15분 지연 피드 + 마감 후
// 지연 프린트 실측 여유. 창을 지나면 3600s.
export const KRX_INDEX_SETTLE_WINDOW_MIN = 15;
export const OVERSEAS_INDEX_SETTLE_WINDOW_MIN = 45;

const withinSettleWindow = (
  minutesSinceClose: number | null,
  windowMin: number,
): boolean => minutesSinceClose !== null && minutesSinceClose < windowMin;

// 지수·랭킹 route 공통 TTL. session·tradingDate 를 cache key 축으로 넣어
// 세션·일 경계에서 자동 miss 를 보장한 다음, TTL 은 최소한만 남긴다.
// regular 60s = 클라 폴링(60s) 과 정렬. 그 외 세션은 폴링 없음 → 3600s 로 KIS 부담 최소화.
// 예외: closed 직후 정산 창(마감 +15분 이내) 은 60s — 확정 프린트가 캐시로 굳는 것 방지.
// stock-intraday(F41) 는 활성 세션(after/pre) 폴링을 유지하는 별 정책이라
// 여기 편입하지 않는다 — 각 route 소유.
export const krxIndexRankingRevalidate = (
  session: KrxSession,
  minutesSinceClose: number | null,
): number => {
  if (session === "regular") return 60;
  return withinSettleWindow(minutesSinceClose, KRX_INDEX_SETTLE_WINDOW_MIN) ? 60 : 3600;
};

// 해외 지수 intraday. 라이브 자체가 ~15분 지연 피드라 국내 60s 보다 완만한 120s.
// closed 는 기본 3600s. 예외: 마감 후 정산 창(마감 +45분, 15분 지연 + 마감 후 프린트
// 실측 여유) 은 60s — 확정 프린트가 캐시로 굳는 것 방지.
// session 축은 코드별 거래소 세션 (`getOverseasIndexSessionState`) — US 3종·아시아 3종·DAX 모두 동일 정책.
export const overseasIntradayRevalidate = (
  session: OverseasIndexSessionState,
  minutesSinceClose: number | null,
): number => {
  if (session === "regular") return 120;
  return withinSettleWindow(minutesSinceClose, OVERSEAS_INDEX_SETTLE_WINDOW_MIN) ? 60 : 3600;
};

// 해외 지수 quote (8종 폴링) TTL. 클라 폴링 60s 와 정렬. idle(KST 05:45~09:00)
// 은 폴링 중단 창이라 3600s 로 KIS 부담 최소화. EDT 기간 US 마감 직후 정산 창
// (05:00~05:45) 은 idle 시작 전이라 active 60s 로 커버된다.
export const globalOverseasQuoteRevalidate = (
  session: GlobalOverseasSession,
): number => (session === "active" ? 60 : 3600);
