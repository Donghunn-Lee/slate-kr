import type { IndexDailySnapshot } from "@/shared/types/quote";

// 일봉 → 월봉. open=월 첫 거래일 시가, close=월 마지막 거래일 종가, high/low=월간 극값.
// 입력은 ASC 가정이지만 안전하게 한 번 정렬.
export const resampleToMonthly = (
  prices: IndexDailySnapshot[]
): IndexDailySnapshot[] => {
  if (prices.length === 0) return [];

  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));
  const groups = new Map<string, IndexDailySnapshot[]>();

  for (const p of sorted) {
    const ym = p.date.slice(0, 7); // "YYYY-MM"
    const list = groups.get(ym);
    if (list) list.push(p);
    else groups.set(ym, [p]);
  }

  return Array.from(groups.entries()).map(([ym, daily]) => {
    const first = daily[0];
    const last = daily[daily.length - 1];
    const high = Math.max(...daily.map((p) => p.high));
    const low = Math.min(...daily.map((p) => p.low));
    const change = last.close - first.open;
    const changeRate = first.open === 0 ? 0 : (change / first.open) * 100;
    return {
      indexCode: first.indexCode,
      date: `${ym}-01`,
      open: first.open,
      high,
      low,
      close: last.close,
      change,
      changeRate,
    };
  });
};
