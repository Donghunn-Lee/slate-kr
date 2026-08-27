import type { ChartBar } from "@/shared/types/quote";

// KIS 국내 분봉 stck_cntg_hour = START 라벨 (봉 시작 시각). HTS 관행은 END 라벨.
// 국내 서빙 표면에서 END 로 통일.
//
// 규칙 (입력 asc 정렬 가정):
//   1. time' = time + intervalSec
//   2. time ≤ closeEpoch && time' > closeEpoch → time' = closeEpoch (마감 크로스 클램프)
//   3. time' 충돌 시 병합: open=선행, close=후행, high/low=극값, volume 합산
//   4. time > closeEpoch (마감 후 봉) → 균일 시프트만, 클램프 없음
//
// closeEpoch 는 각 봉의 fake-UTC time 에서 날짜를 뽑아 그 날의 closeHms 로 재조립 —
// 다일자 봉(전일 tail + 오늘 라이브) 이 섞여도 봉마다 자기 날짜의 close 기준.

// fake-UTC 는 KST 벽시계를 UTC 로 위장한 값이라 getUTC* 로 원본 컴포넌트를 얻는다.
const dateCloseEpochFromBarTime = (barSec: number, closeHms: string): number => {
  const d = new Date(barSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = Number(closeHms.slice(0, 2));
  const mm = Number(closeHms.slice(2, 4));
  const ss = Number(closeHms.slice(4, 6));
  return Math.floor(Date.UTC(y, m, day, hh, mm, ss) / 1000);
};

// existing = 선행(먼저 삽입, 이른 raw time), incoming = 후행(늦은 raw time).
// volume: 하나라도 존재하면 합산, 전부 undefined 면 undefined 유지 (결측 신호 보존).
const mergeCollision = (
  existing: ChartBar,
  incoming: ChartBar,
  time: number,
): ChartBar => {
  const merged: ChartBar = {
    time,
    open: existing.open,
    close: incoming.close,
    high: Math.max(existing.high, incoming.high),
    low: Math.min(existing.low, incoming.low),
  };
  if (existing.volume !== undefined || incoming.volume !== undefined) {
    merged.volume = (existing.volume ?? 0) + (incoming.volume ?? 0);
  }
  return merged;
};

export const toEndLabelBars = (
  bars: readonly ChartBar[],
  intervalSec: number,
  closeHms: string,
): ChartBar[] => {
  const buckets = new Map<number, ChartBar>();
  for (const bar of bars) {
    if (typeof bar.time !== "number") continue;
    const rawTime = bar.time;
    const closeEpoch = dateCloseEpochFromBarTime(rawTime, closeHms);
    let shifted = rawTime + intervalSec;
    if (rawTime <= closeEpoch && shifted > closeEpoch) {
      shifted = closeEpoch;
    }
    const existing = buckets.get(shifted);
    const relabeled: ChartBar = { ...bar, time: shifted };
    if (existing) {
      buckets.set(shifted, mergeCollision(existing, relabeled, shifted));
    } else {
      buckets.set(shifted, relabeled);
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, bar]) => bar);
};
