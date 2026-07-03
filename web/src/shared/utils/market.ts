import { isKrxHoliday } from "./krxHolidays";

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

const pad = (n: number): string => String(n).padStart(2, "0");

type KstParts = { day: number; minutes: number; date: string };

const toKstParts = (now: Date): KstParts => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    day: kst.getUTCDay(),
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    date: `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`,
  };
};

// KST 기준. 주말 + 2026 평일 공휴일 휴장. (after_close 자정 경계는 F14)
// regular 09:00~15:30 / after 15:30~20:00 / after_close 20:00~06:00(자정 넘김) /
// preopen 06:00~08:00 + 08:50~09:00 / pre 08:00~08:50
export const getKrxSessionState = (now: Date = new Date()): KrxSession => {
  const { day, minutes, date } = toKstParts(now);
  if (day === 0 || day === 6) return "closed";
  if (isKrxHoliday(date)) return "closed";
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

// KST 캘린더 일자와 분(0~1439) — 세션 무관, 순수 KST 파싱만.
export const getKstDateAndMinutes = (
  now: Date = new Date(),
): { date: string; minutes: number } => {
  const { date, minutes } = toKstParts(now);
  return { date, minutes };
};

const shiftKstDate = (yyyyMmDd: string, deltaDays: number): string => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const d0 = new Date(Date.UTC(y, m - 1, d));
  d0.setUTCDate(d0.getUTCDate() + deltaDays);
  return `${d0.getUTCFullYear()}-${pad(d0.getUTCMonth() + 1)}-${pad(d0.getUTCDate())}`;
};

const isKrxTradingDay = (yyyyMmDd: string): boolean => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !isKrxHoliday(yyyyMmDd);
};

// fromDate 부터 역방향으로 첫 트레이딩 데이. 연휴 최대 14일 백투백까지 안전.
const findRecentTradingDay = (fromDate: string): string => {
  let d = fromDate;
  for (let i = 0; i < 15; i++) {
    if (isKrxTradingDay(d)) return d;
    d = shiftKstDate(d, -1);
  }
  return d;
};

// 실시간 시세가 반영되는 KRX 거래일(KST).
// regular/after/pre = 오늘 (pre는 NXT 프리마켓 트레이드가 오늘 세션에 귀속).
// after_close 20:00~24:00 = 오늘, 00:00~06:00 = 이전 완결 거래일(자정 넘김 세션).
// preopen/closed = 이전 완결 거래일 (활성 시세 없음, 최근 완결일 스냅샷).
export const getKrxTradingDate = (now: Date = new Date()): string => {
  const session = getKrxSessionState(now);
  const { minutes, date } = toKstParts(now);
  if (session === "regular" || session === "after" || session === "pre") return date;
  if (session === "after_close" && minutes >= AFTER_END_MINUTES) return date;
  return findRecentTradingDay(shiftKstDate(date, -1));
};

// fromDate 직전 거래일. intraday 이전 세션 경계 계산용.
export const getPreviousKrxTradingDate = (fromDate: string): string =>
  findRecentTradingDay(shiftKstDate(fromDate, -1));
