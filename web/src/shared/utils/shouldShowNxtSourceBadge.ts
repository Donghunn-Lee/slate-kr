import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "./market";

// 리스트형 표면(관심 행·홈 프리뷰·검색)에는 KRX/NXT 탭이 없어 표시된 가격이 어느 채널
// 체결인지 판정할 지점이 없다. 이 술어는 "이 가격이 KRX 종가와 다른 채널에서 왔다"는
// 사실만 판정한다 — 채널 간 우열이나 투자 판단 함의는 없다.
type NxtSourceBadgeInput = {
  // 라이브 quote. 부재(EOD 만 표시 중)면 null/undefined.
  quote: Pick<StockQuote, "source" | "price"> | null | undefined;
  // EOD 종가와 그 종가가 속한 거래일.
  eod: { close: number; date: string } | undefined;
  session: KrxSession | undefined;
  // 요청 시각 기준 KRX 거래일. eod.date 와 별개 축이며 적재 지연 구간에서 갈린다.
  tradingDate: string | undefined;
};

// 정규장 마감 후 구간. EOD 적재 지연 창(라이브가는 오늘 · 종가는 아직 전일)이
// 존재할 수 있는 유일한 세션들이다.
const isAfterRegularSession = (session: KrxSession | undefined): boolean =>
  session === "after" || session === "after_close";

export const shouldShowNxtSourceBadge = ({
  quote,
  eod,
  session,
  tradingDate,
}: NxtSourceBadgeInput): boolean => {
  if (!quote) return false;

  switch (quote.source) {
    // KRX 단독 체결가 — KRX 종가와 같은 채널이라 알릴 것이 없다.
    case "krx":
      return false;
    // NXT 단독 체결가는 채널 자체가 다르다. 세션·날짜·종가와 무관하게 표시.
    // multi-quote 는 UN 단일 호출이라 이 표면에서는 도달하지 않지만,
    // QuoteSource 를 남김없이 소진하는 축으로 남긴다.
    case "nx":
      return true;
    // KRX+NXT 통합가. 통합가가 KRX 종가와 갈릴 때만 알린다.
    case "un": {
      // 정규장의 통합가는 KRX 실시간가와 사실상 같은 축이라, 전일 종가와 비교하면
      // 장중 내내 전 종목에 배지가 붙는다. 세션으로 먼저 자른다.
      if (session === "regular") return false;
      if (eod === undefined) return false;
      // 날짜 비교는 마감 후 세션에서만 한다. 거래일 산출은 pre(08:00~08:50)에 이미
      // 오늘을 반환하지만 그 시각 EOD 는 미적재라 eod.date 가 전일로 남는다 —
      // 무조건 비교하면 NXT 프리마켓 거래 중, 즉 배지가 가장 필요한 구간에서 배지가
      // 사라진다. 실제로 걸러야 할 것은 EOD 적재 지연 창 하나뿐이고, 그 창은
      // 마감 후 세션에만 존재한다.
      if (isAfterRegularSession(session) && eod.date !== tradingDate) return false;
      return quote.price !== eod.close;
    }
  }
};
