import { parseISO, startOfWeek, format } from "date-fns";
import type { IndexDailySnapshot } from "@/shared/types/quote";

// 일봉 → 주봉. open=주 첫 거래일 시가, close=주 마지막 거래일 종가, high/low=주간 극값.
// 그룹 키(=출력 date)는 ISO 월요일 "yyyy-MM-dd" (weekStartsOn: 1).
// resampleToMonthly 미러. 집계 로직·changeRate 0가드·필드 구성 완전 동일, 그룹 키만 다르다.
export const resampleToWeekly = (
  prices: IndexDailySnapshot[]
): IndexDailySnapshot[] => {
  if (prices.length === 0) return [];

  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));
  const groups = new Map<string, IndexDailySnapshot[]>();

  for (const p of sorted) {
    const monday = format(
      startOfWeek(parseISO(p.date), { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );
    const list = groups.get(monday);
    if (list) list.push(p);
    else groups.set(monday, [p]);
  }

  return Array.from(groups.entries()).map(([monday, daily]) => {
    const first = daily[0];
    const last = daily[daily.length - 1];
    const high = Math.max(...daily.map((p) => p.high));
    const low = Math.min(...daily.map((p) => p.low));
    const change = last.close - first.open;
    const changeRate = first.open === 0 ? 0 : (change / first.open) * 100;
    return {
      indexCode: first.indexCode,
      date: monday,
      open: first.open,
      high,
      low,
      close: last.close,
      change,
      changeRate,
    };
  });
};
