import type { ChartBar } from "@/shared/types/quote";
import { isInvalidQuoteOhl, type LiveQuoteForMerge } from "./mergeLiveDayBar";

// intraday 봉(1분) 배열 + 라이브 quote 병합. 마지막 봉 update-only — close 를 quote.price
// 로 대체, high/low 는 필요 시 확장. 새 봉 append 금지(KIS 응답 밖 분봉을 위조하지 않는다),
// volume 불변.
//
// 서버 캐시 세션 정합화(#102) 위의 안전망 — 헤더 60s 폴링 quote 로 캐시 miss 사이 gap 을
// 마스킹해 차트 최신 봉 close 가 실시간 값을 따라 움직인다.
//
// 스킵 가드(원본 배열 그대로 반환 — 참조 안정성):
//   - previousDay=true → 봉은 어제, quote 는 오늘 (병합 시 date 축 어긋남)
//   - quoteDate ≠ chartTradingDate → 세션 전환 직후 등 축 불일치
//   - bars 빈 배열 → 마스킹 대상 없음
//   - quote OHL 삼중 0 → 오프아워 스냅샷(quote_snapshots 서빙) 형식.
//     price=어제 20:00 UN 종가로 latePreopen(08:50~09:00) 시 오늘 08:50 pre 봉 close 를
//     어제 값으로 덮어쓰는 문제 차단. mergeLiveDayBar 와 동일 게이트 재사용.
//   - 마지막 봉 KST 날짜 ≠ chartTradingDate → 전일 tail-only(비NXT pre 등) 케이스에서
//     오늘 quote 로 어제 tail 마지막 봉을 덮어쓰는 것 차단
//   - quote.price 가 마지막 봉 close 와 동일 → 참조 변경 무의미
const barKstDateOf = (t: ChartBar["time"]): string | null => {
  if (typeof t !== "number") return null;
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const mergeLiveIntradayBar = (
  bars: ChartBar[],
  quote: LiveQuoteForMerge | null,
  quoteDate: string | undefined,
  chartTradingDate: string | undefined,
  previousDay: boolean,
): ChartBar[] => {
  if (!quote || previousDay) return bars;
  if (isInvalidQuoteOhl(quote)) return bars;
  if (!quoteDate || !chartTradingDate) return bars;
  if (quoteDate !== chartTradingDate) return bars;
  if (bars.length === 0) return bars;

  const last = bars[bars.length - 1];
  const lastKstDate = barKstDateOf(last.time);
  if (lastKstDate !== null && lastKstDate !== chartTradingDate) return bars;
  if (quote.price === last.close) return bars;

  const merged: ChartBar = {
    ...last,
    close: quote.price,
    high: Math.max(last.high, quote.price),
    low: Math.min(last.low, quote.price),
  };
  return [...bars.slice(0, -1), merged];
};
