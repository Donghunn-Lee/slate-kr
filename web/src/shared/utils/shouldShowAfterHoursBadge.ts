import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "./market";

// 리스트형 표면(관심 행·홈 프리뷰·검색)에는 KRX/NXT 탭이 없어 표시된 가격이 어느 세션
// 체결인지 판정할 지점이 없다. 이 술어는 "이 가격이 KRX 정규장이 아니라 장외 세션
// (NXT 프리마켓 · 애프터마켓 · 애프터마켓 마감) 의 값" 이라는 사실만 판정한다 —
// 시장 간 우열이나 투자 판단 함의는 없다.
// 종가와 비교하지 않는 이유: daily_prices.close 가 20:00 마감 캔들이라 애프터마켓 중엔 전
// 종목이 종가와 다르고 마감 뒤엔 전 종목이 같다 — 값 비교는 세션 이상의 정보를 주지 않는다.
type AfterHoursBadgeInput = {
  // 라이브 quote. 부재(EOD 만 표시 중)면 null/undefined.
  quote: Pick<StockQuote, "source"> | null | undefined;
  session: KrxSession | undefined;
  // KRX 애프터마켓(16:00~) 진입 여부(isKrxAfterMarketOpen). after 세션은 15:30 부터라
  // 세션만으로는 정규장 마감 구간(15:30~16:00, 값은 15:30 종가)을 가를 수 없다.
  krxAfterMarketOpen: boolean;
};

// 값이 애프터마켓 체결(16:00~) 이거나 그 마감값(after_close · closed 의 스냅샷)인 구간.
// 15:40~16:00 의 NXT 애프터 체결은 UN 통합가에 섞여도 표시하지 않는다 — 리스트 표면은 종목의
// NXT 취급 여부를 모르고, 비NXT 종목까지 16:00 전에 "애프터" 를 달면 거짓 신호가 된다.
const isAfterMarketValue = (
  session: KrxSession | undefined,
  krxAfterMarketOpen: boolean,
): boolean =>
  session === "after"
    ? krxAfterMarketOpen
    : session === "after_close" || session === "closed";

export const shouldShowAfterHoursBadge = ({
  quote,
  session,
  krxAfterMarketOpen,
}: AfterHoursBadgeInput): boolean => {
  if (!quote) return false;

  switch (quote.source) {
    // KRX 단독 체결가 — KRX 정규장과 같은 채널이라 알릴 것이 없다.
    case "krx":
      return false;
    // NXT 단독 체결가만 프리마켓(pre) 값이 될 수 있다. multi-quote 는 UN 단일 호출이라
    // 이 표면에 도달하지 않지만 QuoteSource 를 남김없이 소진하는 축으로 남긴다.
    case "nx":
      return session === "pre" || isAfterMarketValue(session, krxAfterMarketOpen);
    // KRX+NXT 통합가. pre 의 UN 값은 비NXT 종목이면 전일 종가 그대로라 — NXT 취급 여부를
    // 모르는 리스트 표면에서는 프리마켓 값이라 단정할 수 없어 애프터 계열만 표시한다.
    case "un":
      return isAfterMarketValue(session, krxAfterMarketOpen);
  }
};
