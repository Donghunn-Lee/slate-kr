import type { ChartBar } from "@/shared/types/quote";

// 1분봉(=intraday raw) → N분봉. bucket key = floor(time / (N*60)) * (N*60).
// OHLC 표준: 첫 open / max high / min low / 마지막 close. 볼륨은 버킷 내 합산.
// minutes ≤ 1 이면 raw 를 그대로 반환 — 호출부에서 분기 없이 항상 통과시켜도 안전.
// time 이 number 아닌 봉은 스킵 (intraday 는 number 로 통일이지만 방어적).
export const resampleIntradayBars = (
  bars: ChartBar[],
  minutes: number,
): ChartBar[] => {
  if (bars.length === 0 || minutes <= 1) return bars;
  const bucketSec = minutes * 60;
  const groups = new Map<number, ChartBar[]>();
  for (const b of bars) {
    if (typeof b.time !== "number") continue;
    const key = Math.floor(b.time / bucketSec) * bucketSec;
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => {
      const first = list[0];
      const last = list[list.length - 1];
      let high = first.high;
      let low = first.low;
      let volume: number | undefined = undefined;
      for (const b of list) {
        if (b.high > high) high = b.high;
        if (b.low < low) low = b.low;
        if (b.volume !== undefined) {
          volume = (volume ?? 0) + b.volume;
        }
      }
      return {
        time: key,
        open: first.open,
        high,
        low,
        close: last.close,
        volume,
      };
    });
};
