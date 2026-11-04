import type { ChartBar, IndexQuote } from "@/shared/types/quote";
import type { OverseasIndexCode } from "@/shared/constants/indices";
import { indexIntradayBarsAt, indexQuoteAt } from "./demo-index-model";

// 해외 지수 현재가 · 1분봉 — 전부 생성기 산출. 봉 시각은 거래소 로컬 벽시계를 UTC 로 위장한
// fake-UTC 초(START 라벨)라 lightweight-charts 가로축이 그 값을 그대로 라벨링한다.

// null = 분봉을 공개하지 않는 지수(.DJI). 그 외는 직전 거래일 + 오늘(지연 분 반영, 지금까지).
// volume 은 싣지 않는다 — 해외 지수 분봉은 거래량 없이 그린다(toIntradaySnapshots 가 0 으로 채움).
// now 주입 가능 — 로컬 테스트용.
export const fetchOverseasIndexIntradayChart = async (
  code: OverseasIndexCode,
  now: Date = new Date(),
): Promise<ChartBar[] | null> => {
  const bars = indexIntradayBarsAt(code, now);
  if (bars === null) return null;
  return bars.map((bar) => ({
    time: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
};

// 8종 quote 폴링용. .DJI 는 분봉이 없어 time=null 로 돌아온다 — 소비측이 일봉 폴백으로 그린다.
export const fetchOverseasIndexQuote = async (
  code: OverseasIndexCode,
  name: string,
): Promise<IndexQuote | null> => indexQuoteAt(code, name, new Date());
