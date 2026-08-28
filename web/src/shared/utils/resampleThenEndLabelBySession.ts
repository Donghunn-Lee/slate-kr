import type { ChartBar } from "@/shared/types/quote";
import { resampleIntradayBars } from "./resampleIntradayBars";
import { toEndLabelBars } from "./toEndLabelBars";

// 세션 분할 리샘플 + END 라벨.
//
// 배경: floor 리샘플 버킷이 세션 경계를 걸치면 (예: 15분 버킷 15:30 = raw 15:30~15:44)
//   경계 이후 raw(NXT 애프터 15:40~44) 가 마감 봉 END 15:30 에 흡수된다. 원인은
//   `toEndLabelBars` 의 클램프가 버킷 라벨(15:30) 을 raw 시각으로 간주하기 때문.
//
// 해결: 봉의 시각으로 boundary 세션 세그먼트를 먼저 나눈 뒤 세그먼트 내부에서만
//   resampleIntradayBars + toEndLabelBars 를 호출. 각 세그먼트는 자기 마감 boundary
//   1개(또는 trailing 은 없음) 만 안다.
//
// 세그먼트 정의 (closeHmsList ASC 가정):
//   seg 0        : raw ≤ boundaries[0]                      · close = boundaries[0]
//   seg 1        : boundaries[0]  < raw ≤ boundaries[1]     · close = boundaries[1]
//   ...
//   trailing     : raw > boundaries[last]                   · close = 없음(클램프 없음)
//
// 다일자 안전: 세그먼트는 (봉의 KST 날짜, segIdx) 로 그룹. 각 봉의 boundary 는
//   자기 날짜에서 재조립 — `toEndLabelBars` 내부 규약과 동형.
//
// pass-through 케이스:
//   - closeHmsList 가 빈 배열 → 전 raw 를 trailing 하나로 취급 (클램프 없음).
//   - 1분 리샘플 (minutes ≤ 1) 은 resampleIntradayBars 가 pass-through.
//   - N분 리샘플에서 세그먼트가 경계를 안 걸치는 케이스(정규장 09:00~15:30 내부 등)
//     는 리샘플→toEndLabelBars 직결과 결과 동일.

// fake-UTC 는 KST 벽시계를 UTC 로 위장한 값 — getUTC* 로 원본 컴포넌트를 얻는다.
const dateKeyOf = (barSec: number): string => {
  const d = new Date(barSec * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

const boundarySecsFromBarTime = (
  barSec: number,
  closeHmsList: readonly string[],
): number[] => {
  const d = new Date(barSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return closeHmsList.map((hms) =>
    Math.floor(
      Date.UTC(
        y,
        m,
        day,
        Number(hms.slice(0, 2)),
        Number(hms.slice(2, 4)),
        Number(hms.slice(4, 6)),
      ) / 1000,
    ),
  );
};

type Segment = {
  segIdx: number; // 세그먼트 인덱스 (0..len, len = trailing)
  closeHms: readonly string[]; // toEndLabelBars 에 넘길 boundary — trailing 은 []
  bars: ChartBar[];
};

export const resampleThenEndLabelBySession = (
  bars: readonly ChartBar[],
  minutes: number,
  closeHmsList: readonly string[],
): ChartBar[] => {
  if (bars.length === 0) return [];

  // 경계 없음 → 세션 분할 무의미. 전 배열을 리샘플→toEndLabelBars 직결.
  if (closeHmsList.length === 0) {
    return toEndLabelBars(
      resampleIntradayBars([...bars], minutes),
      minutes * 60,
      [],
    );
  }

  const segmentsByKey = new Map<string, Segment>();

  for (const bar of bars) {
    if (typeof bar.time !== "number") continue;
    const t = bar.time;
    const boundaries = boundarySecsFromBarTime(t, closeHmsList);
    let segIdx = boundaries.findIndex((bd) => t <= bd);
    let closeHms: readonly string[];
    if (segIdx === -1) {
      segIdx = boundaries.length; // trailing
      closeHms = [];
    } else {
      closeHms = [closeHmsList[segIdx]];
    }
    const key = `${dateKeyOf(t)}#${segIdx}`;
    let seg = segmentsByKey.get(key);
    if (!seg) {
      seg = { segIdx, closeHms, bars: [] };
      segmentsByKey.set(key, seg);
    }
    seg.bars.push(bar);
  }

  const results: ChartBar[] = [];
  for (const seg of segmentsByKey.values()) {
    const resampled = resampleIntradayBars(seg.bars, minutes);
    const endLabeled = toEndLabelBars(resampled, minutes * 60, seg.closeHms);
    for (const b of endLabeled) results.push(b);
  }

  results.sort((a, b) => {
    const ta = typeof a.time === "number" ? a.time : 0;
    const tb = typeof b.time === "number" ? b.time : 0;
    return ta - tb;
  });
  return results;
};
