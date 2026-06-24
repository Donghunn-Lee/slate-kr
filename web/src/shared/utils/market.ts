const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAWN_END_MINUTES = 6 * 60; // 06:00 KST — 새벽 리셋 시작
const PRE_START_MINUTES = 8 * 60; // 08:00 KST — 프리마켓 시작
const PRE_END_MINUTES = 8 * 60 + 50; // 08:50 KST — 프리마켓 종료
const REGULAR_START_MINUTES = 9 * 60; // 09:00 KST — 정규장 시작
const REGULAR_END_MINUTES = 15 * 60 + 30; // 15:30 KST — 정규장 종료
const AFTER_END_MINUTES = 20 * 60; // 20:00 KST — 애프터마켓 종료

export type KrxSession =
  | "regular"
  | "after"
  | "after_close"
  | "pre"
  | "preopen"
  | "closed";

type KstParts = { day: number; minutes: number };

const toKstParts = (now: Date): KstParts => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    day: kst.getUTCDay(),
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
};

// KST 기준 평일만. 공휴일 미고려(v1).
// regular 09:00~15:30 / after 15:30~20:00 / after_close 20:00~06:00(자정 넘김) /
// preopen 06:00~08:00 + 08:50~09:00 / pre 08:00~08:50
export const getKrxSessionState = (now: Date = new Date()): KrxSession => {
  const { day, minutes } = toKstParts(now);
  if (day === 0 || day === 6) return "closed";
  if (minutes >= REGULAR_START_MINUTES && minutes < REGULAR_END_MINUTES) return "regular";
  if (minutes >= REGULAR_END_MINUTES && minutes < AFTER_END_MINUTES) return "after";
  if (minutes >= AFTER_END_MINUTES || minutes < DAWN_END_MINUTES) return "after_close";
  if (minutes >= DAWN_END_MINUTES && minutes < PRE_START_MINUTES) return "preopen";
  if (minutes >= PRE_START_MINUTES && minutes < PRE_END_MINUTES) return "pre";
  if (minutes >= PRE_END_MINUTES && minutes < REGULAR_START_MINUTES) return "preopen";
  return "closed";
};

export const isKrxMarketOpen = (now: Date = new Date()): boolean =>
  getKrxSessionState(now) === "regular";
