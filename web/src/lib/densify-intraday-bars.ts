import type { ChartBar } from "@/shared/types/quote";

// FHKST03010230 응답은 실체결 분만 담는 sparse 봉 — 120행 = 120 체결 분이지 120분이 아니다.
// 차트 축은 "봉 1개 = 1분" dense 전제(초기 창·logical range)라 무체결 분을 채워야 한다.
// fill 봉은 KIS 자체 flat 봉과 같은 형태 — O=H=L=C=직전 종가 · vol 0.

const SLOT_SEC = 60;

// fake-UTC 봉 시각(KST 벽시계를 UTC 로 위장) → HHMMSS. 갭 창 술어의 입력 포맷.
const toHhmmss = (sec: number): string => {
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

// [startSec, endSec] 양끝 포함 · 분 단위 슬롯. isExcluded(HHMMSS, 슬롯 초) 가 참인 분은
// 제외 — 세션·갭 창 판정을 호출측 술어에 위임해 스케줄 지식을 여기 두지 않는다.
// startSec > endSec 면 [].
export const buildMinuteSlots = (
  startSec: number,
  endSec: number,
  isExcluded: (hhmmss: string, slotSec: number) => boolean,
): number[] => {
  const slots: number[] = [];
  for (let t = startSec; t <= endSec; t += SLOT_SEC) {
    if (!isExcluded(toHhmmss(t), t)) slots.push(t);
  }
  return slots;
};

const fillBar = (time: number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

// bars(ASC · number time) 에 slots(ASC) 의 빈 분을 fill 봉으로 채운다. 실봉은 슬롯 집합
// 밖이라도 모두 보존 — 슬롯은 채움 대상만 정하지 실봉을 거르지 않는다(갭 창 안 실체결 등).
// fill 종가는 그 슬롯 이전 마지막 봉(실봉·fill 무관) 의 close. 선행 봉이 하나도 없는
// 앞쪽 슬롯은 직전 종가가 없으므로 채우지 않는다.
export const densifyIntradayBars = (
  bars: readonly ChartBar[],
  slots: readonly number[],
): ChartBar[] => {
  const out: ChartBar[] = [];
  let i = 0;
  let prevClose: number | undefined;
  const pushReal = (b: ChartBar) => {
    out.push(b);
    prevClose = b.close;
    i += 1;
  };
  for (const slot of slots) {
    while (i < bars.length && (bars[i].time as number) < slot) pushReal(bars[i]);
    if (i < bars.length && bars[i].time === slot) {
      pushReal(bars[i]);
    } else if (prevClose !== undefined) {
      out.push(fillBar(slot, prevClose));
    }
  }
  while (i < bars.length) pushReal(bars[i]);
  return out;
};
