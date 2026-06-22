const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const OPEN_MINUTES = 9 * 60; // 09:00 KST
const CLOSE_MINUTES = 15 * 60 + 30; // 15:30 KST

// KST 기준 평일 09:00~15:30 이면 true. 공휴일은 고려하지 않는다(v1).
export const isKrxMarketOpen = (now: Date = new Date()): boolean => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;

  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= OPEN_MINUTES && minutes <= CLOSE_MINUTES;
};
