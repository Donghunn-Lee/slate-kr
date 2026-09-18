import type { MarketCalendar } from "@/shared/types/marketCalendar";
import type { KrxSession } from "@/shared/utils/market";
import {
  isKrxAfterMarketOpen,
  isKrxBeforeMarketOpen,
  isKrxOpeningWindow,
} from "@/shared/utils/market";

// 순위 집계 기준 "세션 · 시장" 캡션. 세션 단어는 종목 헤더(stockHeaderLabel) 구간표를 따르되
// 소스 시장의 탭 문구를 쓴다 — 시장은 route 의 세션→시장코드 축(개장 전 NX, 그 외 J).
// NX 구간은 NXT 탭 문구: pre 는 프리마켓 체결 중, 늦은 preopen(08:50~09:00) 은 08:50 마감,
// 이른 preopen(06:00~08:00) 은 직전 20:00 마감 상태.
// after 는 KRX 애프터마켓 개시(16:00) 전까지 마감 표기 — 헤더와 같은 판정.
// now=null(SSR·첫 렌더) 은 null — 클라 시계가 서기 전엔 경계 판정을 하지 않는다.
export const resolveRankingCaption = (
  session: KrxSession | undefined,
  now: Date | null,
  calendar?: MarketCalendar,
): string | null => {
  if (session === undefined || now === null) return null;
  if (session === "pre") return "프리마켓 · NXT";
  if (isKrxBeforeMarketOpen(session)) {
    return isKrxOpeningWindow(session, now, calendar)
      ? "프리마켓 마감 · NXT"
      : "애프터마켓 마감 · NXT";
  }
  if (session === "regular") return "정규장 · KRX";
  if (session === "after") {
    return isKrxAfterMarketOpen(now, calendar)
      ? "애프터마켓 · KRX"
      : "정규장 마감 · KRX";
  }
  return "애프터마켓 마감 · KRX";
};
