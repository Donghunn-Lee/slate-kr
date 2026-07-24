import { isKrxHoliday } from "./krxHolidays";
import { isUsMarketHoliday } from "./usMarketHolidays";

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

// 지수 라벨용 "가장 최근 완결 정규장 마감일".
// 오늘이 거래일이고 15:30 지났으면 오늘, 그 외(개장 전·주말·휴장·다음날 새벽/오전)엔 지난 거래일.
// getKrxTradingDate 와 다른 점: pre(08:00~08:50 NXT 프리마켓)에서도 지난 마감일을 반환 —
// 지수는 정규장 개장 전까지 어제 종가가 최신 완결값이므로.
export const getKrxLastCloseDate = (now: Date = new Date()): string => {
  const { minutes, date } = toKstParts(now);
  if (isKrxTradingDay(date) && minutes >= REGULAR_END_MINUTES) return date;
  return findRecentTradingDay(shiftKstDate(date, -1));
};

// ── US 세션 (NYSE 정규장 09:30~16:00 ET) ─────────────────
// DST 자동: Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' }) 로 ET 파싱.
// 조기마감(1/2, 7/3(Thu), 11/27, 12/24 등)은 보수적으로 정규 16:00 마감으로 취급.

const US_REGULAR_START_MINUTES = 9 * 60 + 30;
const US_REGULAR_END_MINUTES = 16 * 60;

export type UsSession = "regular" | "closed";

type EtParts = { day: number; minutes: number; date: string };

const US_ET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const toEtParts = (now: Date): EtParts => {
  const parts = US_ET_FORMATTER.formatToParts(now);
  const bag: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") bag[p.type] = p.value;
  const hour = Number(bag.hour === "24" ? "00" : bag.hour); // en-US 24h 는 자정을 "24" 로 반환
  return {
    day: WEEKDAY_TO_INDEX[bag.weekday] ?? 0,
    minutes: hour * 60 + Number(bag.minute),
    date: `${bag.year}-${bag.month}-${bag.day}`,
  };
};

export const getUsSessionState = (now: Date = new Date()): UsSession => {
  const { day, minutes, date } = toEtParts(now);
  if (day === 0 || day === 6) return "closed";
  if (isUsMarketHoliday(date)) return "closed";
  if (minutes >= US_REGULAR_START_MINUTES && minutes < US_REGULAR_END_MINUTES) return "regular";
  return "closed";
};

export const isUsMarketOpen = (now: Date = new Date()): boolean =>
  getUsSessionState(now) === "regular";

// ET 캘린더 일자와 분(0~1439). 세션 무관, 순수 ET 파싱만.
export const getEtDateAndMinutes = (
  now: Date = new Date(),
): { date: string; minutes: number } => {
  const { date, minutes } = toEtParts(now);
  return { date, minutes };
};

const shiftUsDate = shiftKstDate; // 순수 캘린더 산술 — TZ 무관, 재사용.

const isUsTradingDay = (yyyyMmDd: string): boolean => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !isUsMarketHoliday(yyyyMmDd);
};

const findRecentUsTradingDay = (fromDate: string): string => {
  let d = fromDate;
  for (let i = 0; i < 15; i++) {
    if (isUsTradingDay(d)) return d;
    d = shiftUsDate(d, -1);
  }
  return d;
};

// 실시간 시세가 반영되는 NYSE 거래일(ET).
// regular = 오늘. 그 외(pre-open · 애프터마켓 · 주말 · 휴장) = 이전 완결 거래일.
// getKrxTradingDate 와 달리 US 는 세션 상태를 regular/closed 2-state 로만 다룬다.
export const getUsTradingDate = (now: Date = new Date()): string => {
  const { date } = toEtParts(now);
  if (getUsSessionState(now) === "regular") return date;
  return findRecentUsTradingDay(shiftUsDate(date, -1));
};

// fromDate 직전 US 거래일. intraday 이전 세션 경계 계산용.
export const getPreviousUsTradingDate = (fromDate: string): string =>
  findRecentUsTradingDay(shiftUsDate(fromDate, -1));
