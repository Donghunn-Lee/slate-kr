// 좌측 여백 whitespace 포인트 생성 — 첫 봉 앞에 count 개.
// step = bars 앞 5개 gap 중 최솟값 (금→월 3d 등 휴장 gap 을 회피, 기본 캐던스 사용).
// count <= 0 또는 bars.length < 2 → [] (step 산정 불가). step <= 0 → [].
// 반환 = bars[0].time − k·step, k = count..1 (오름차순).
export const makeLeadingWhitespace = (
  bars: readonly { time: number }[],
  count: number,
): { time: number }[] => {
  if (count <= 0 || bars.length < 2) return [];
  const window = Math.min(5, bars.length - 1);
  let step = Infinity;
  for (let i = 0; i < window; i++) {
    const gap = bars[i + 1].time - bars[i].time;
    if (gap > 0 && gap < step) step = gap;
  }
  if (!Number.isFinite(step) || step <= 0) return [];
  const first = bars[0].time;
  const out: { time: number }[] = [];
  for (let k = count; k >= 1; k--) {
    out.push({ time: first - k * step });
  }
  return out;
};
