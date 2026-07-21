import type { ChartBar } from "@/shared/types/quote";

// today-bar 합성용 라이브 quote 필드. IndexQuote/StockQuote 공통 최소 셋.
// volume 은 종목 quote 만 제공 — 지수 quote 는 undefined.
export type LiveQuoteForMerge = {
  open: number;
  high: number;
  low: number;
  price: number;
  volume?: number;
};

// KIS quote 응답이 세션 시작 전(preopen/비NXT 종목 등) 에 O/H/L 을 문자열 "0" 으로
// 반환하는 케이스를 무효로 판정한다. change/changeRate 는 개별 필드로 유지되며
// 여기서는 OHL 삼중 0 만을 무효 신호로 삼는다 — 세 값 모두 0 이 자연스러운 실거래
// 봉은 존재하지 않음(호가만 있어도 OHL 은 채워짐).
export const isInvalidQuoteOhl = (q: {
  open: number;
  high: number;
  low: number;
}): boolean => q.open === 0 && q.high === 0 && q.low === 0;

// EOD 일봉 + 라이브 quote 병합. 라이브가 오늘 봉이면 replace, 새 날짜면 append.
//
// 무효 quote(OHL=0) 게이트:
//   - EOD 마지막 봉의 date 가 병합 date 와 같으면 → EOD 유지(무효 quote 로 덮지 않음).
//     preopen 세션에 index-quote route 가 어제 tradingDate 로 호출되며 EOD 마지막 봉을
//     O=H=L=0 으로 파괴하던 정확한 케이스를 여기서 차단.
//   - 새 날짜(오늘 봉이 아직 EOD 에 없음) → 전일 종가로 O=H=L=C 인 도지 봉 forming.
//     비거래일이 아니라 "무효 quote" 로 게이트 — 과거 비거래일 대응으로 intraday gate
//     를 제거한 결정과 충돌하지 않도록 반드시 분리.
export const mergeLiveDayBar = (
  eod: ChartBar[],
  quote: LiveQuoteForMerge | null,
  date: string | undefined,
): ChartBar[] => {
  if (!quote || !date) return eod;
  const last = eod[eod.length - 1];

  if (isInvalidQuoteOhl(quote)) {
    if (last && last.time === date) return eod;
    const prevClose = last?.close ?? quote.price;
    if (prevClose <= 0) return eod;
    return [
      ...eod,
      {
        time: date,
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
        volume: quote.volume ?? 0,
      },
    ];
  }

  const preservedVolume = last && last.time === date ? last.volume : undefined;
  const live: ChartBar = {
    time: date,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.price,
    volume: quote.volume ?? preservedVolume,
  };
  if (last && last.time === date) return [...eod.slice(0, -1), live];
  return [...eod, live];
};
