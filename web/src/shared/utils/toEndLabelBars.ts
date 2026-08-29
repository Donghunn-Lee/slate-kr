import type { ChartBar } from "@/shared/types/quote";

// KIS 국내 분봉 stck_cntg_hour = START 라벨 (봉 시작 시각). HTS 관행은 END 라벨.
// 국내 서빙 표면에서 END 로 통일.
//
// 세션 경계 목록(closeHmsList ASC) 각각을 마감 크로스 클램프 앵커로 사용 —
// 정규장 15:30 외에 NXT 프리 08:50, 애프터 20:00 도 커버. 단일 경계 케이스는
// 길이 1 리스트로 전달 (예: 지수 = ["153000"]).
//
// 규칙 (입력 asc 정렬 가정):
//   1. time' = time + intervalSec
//   2. B = 그 봉이 속한 날짜의 경계 중 raw 시각 이상인 최소값 (없음 → 클램프 없음)
//   3. time' > B → time' = B (마감 크로스 클램프)
//   4. time' 충돌 시 병합: open=선행, close=후행, high/low=극값, volume 합산
//   5. 모든 경계 초과 봉(B=null) → 균일 시프트만
//
// 경계는 각 봉의 fake-UTC time 에서 날짜를 뽑아 그 날의 closeHmsList 로 재조립 —
// 다일자 봉(전일 tail + 오늘 라이브)이 섞여도 봉마다 자기 날짜의 경계 세트 기준.

// fake-UTC 는 KST 벽시계를 UTC 로 위장한 값이라 getUTC* 로 원본 컴포넌트를 얻는다.
const dateBoundariesFromBarTime = (
  barSec: number,
  closeHmsList: readonly string[],
): number[] => {
  const d = new Date(barSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return closeHmsList.map((hms) => {
    const hh = Number(hms.slice(0, 2));
    const mm = Number(hms.slice(2, 4));
    const ss = Number(hms.slice(4, 6));
    return Math.floor(Date.UTC(y, m, day, hh, mm, ss) / 1000);
  });
};

// closeHmsList ASC 가정 → boundaries 도 ASC. 첫 boundary >= rawTime 반환 (없으면 null).
const nextBoundaryAtOrAfter = (
  rawTime: number,
  boundaries: readonly number[],
): number | null => {
  for (const b of boundaries) {
    if (b >= rawTime) return b;
  }
  return null;
};

// existing = 선행(먼저 삽입, 이른 raw time), incoming = 후행(늦은 raw time).
// volume: 하나라도 존재하면 합산, 전부 undefined 면 undefined 유지 (결측 신호 보존).
export const mergeChartBars = (
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
  closeHmsList: readonly string[],
): ChartBar[] => {
  const buckets = new Map<number, ChartBar>();
  for (const bar of bars) {
    if (typeof bar.time !== "number") continue;
    const rawTime = bar.time;
    const boundaries = dateBoundariesFromBarTime(rawTime, closeHmsList);
    let shifted = rawTime + intervalSec;
    const boundary = nextBoundaryAtOrAfter(rawTime, boundaries);
    if (boundary !== null && shifted > boundary) {
      shifted = boundary;
    }
    const existing = buckets.get(shifted);
    const relabeled: ChartBar = { ...bar, time: shifted };
    if (existing) {
      buckets.set(shifted, mergeChartBars(existing, relabeled, shifted));
    } else {
      buckets.set(shifted, relabeled);
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, bar]) => bar);
};
