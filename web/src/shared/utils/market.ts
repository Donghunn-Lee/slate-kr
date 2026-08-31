import {
  OVERSEAS_INDEX_CLOSE_LOCAL,
  OVERSEAS_INDEX_OPEN_LOCAL,
  OVERSEAS_INDEX_TIMEZONE,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
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

// KRX 정규장 / NXT 확장 세션(프리·애프터) 두 시장 축.
// 세션별 기본값: regular 는 KRX, 그 외는 NXT 확장 세션이 유일한 라이브 소스.
export type QuoteMarket = "krx" | "nxt";

export const defaultMarketForSession = (
  session: KrxSession | undefined,
): QuoteMarket => (session === "regular" ? "krx" : "nxt");

// 활성 세션 술어 — regular/after/pre 에서 라이브 시세가 흐른다.
// stock-quote 헤더 폴링(useStockQuote)과 stock-intraday 차트 폴링(useStockIntraday)이
// 동일한 활성 정의를 공유하도록 순수 술어로 노출. session 문자열을 인자로 받아
// 서버 응답 session 또는 클라 시계 판정 어느 쪽에서든 재사용 가능.
export const isKrxActiveSession = (session: KrxSession | undefined): boolean =>
  session === "regular" || session === "after" || session === "pre";

// preopen 창을 세분화. NXT 프리 존재 가능성이 다르다.
// 아침(06:00~08:00): NXT 프리 미개시 → 오늘 봉 자체 없음. 전일 스냅샷 fallback 대상.
// 늦은(08:50~09:00): NXT 종목은 08:00~08:50 봉이 이미 쌓임. 라벨은 붙되 차트는 유지.
export const isKrxEarlyPreopen = (now: Date = new Date()): boolean => {
  if (getKrxSessionState(now) !== "preopen") return false;
  const { minutes } = toKstParts(now);
  return minutes < PRE_START_MINUTES;
};

export const isKrxLatePreopen = (now: Date = new Date()): boolean => {
  if (getKrxSessionState(now) !== "preopen") return false;
  const { minutes } = toKstParts(now);
  return minutes >= PRE_END_MINUTES;
};

// 정규장 개장 전(pre · preopen) 세션 술어. 일봉 today-bar live merge 게이트에 사용.
// preopen 은 스냅샷 OHL=0 + date 가 전일로 반환되어 mergeLiveDayBar 자체에서 자연 차단되지만
// 술어에 포함시켜 "정규장 개장 전엔 당일 봉을 얹지 않는다"는 의도를 문서화한다.
// pre(08:00~08:50) 는 NXT 프리마켓 실봉이 KRX 라벨 일봉 축에 유입되는 것을 명시 차단.
// regular/after/after_close/closed 는 무변경 (애프터 정합은 F41 별도).
export const isKrxBeforeMarketOpen = (
  session: KrxSession | undefined,
): boolean => session === "pre" || session === "preopen";

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

// 당일 KRX 정규장 마감(15:30) 이후 경과 분. 개장 전·자정 넘김·주말·휴장이면 null —
// 전일 마감까지 소급해 계산하지 않는다(당일 마감 후 확정 프린트 도달 창에만 관심).
export const minutesSinceKrxClose = (now: Date = new Date()): number | null => {
  const { date, minutes } = toKstParts(now);
  if (!isKrxTradingDay(date)) return null;
  if (minutes < REGULAR_END_MINUTES) return null;
  return minutes - REGULAR_END_MINUTES;
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

// ── 글로벌 해외지수 coarse 세션 ─────────────────
// KST 05:45~09:00 은 전 세계 주요 시장(US/EU/아시아) 공통 휴지 구간 → 폴링 중단.
// 시장별 세션·휴장 캘린더는 만들지 않는다 — 마감 시장은 KIS 가 종가를 반환하므로
// 값 표시는 성립.
// 05:45 = US 정규장 마감(EDT 기간 KST 05:00) + 45분 정산 프린트 버퍼.
// EST 기간(마감 KST 06:00)은 창 시작이 마감보다 앞서므로 이 버퍼로는 커버되지 않는다.
const GLOBAL_OVERSEAS_IDLE_START_MINUTES = 5 * 60 + 45; // 05:45 KST
const GLOBAL_OVERSEAS_IDLE_END_MINUTES = 9 * 60; // 09:00 KST

export type GlobalOverseasSession = "active" | "idle";

export const getGlobalOverseasSessionState = (
  now: Date = new Date(),
): GlobalOverseasSession => {
  const { minutes } = toKstParts(now);
  return minutes >= GLOBAL_OVERSEAS_IDLE_START_MINUTES &&
    minutes < GLOBAL_OVERSEAS_IDLE_END_MINUTES
    ? "idle"
    : "active";
};

export const isGlobalOverseasActive = (now: Date = new Date()): boolean =>
  getGlobalOverseasSessionState(now) === "active";

// ── 해외 지수별 세션 (거래소 TZ 로컬) ─────────────────
// US 세션과 대칭: DST 는 IANA DB(`OVERSEAS_INDEX_TIMEZONE[code]`) 에 위임하고
// open/close 는 지수별 상수 테이블(`OVERSEAS_INDEX_OPEN_LOCAL`·`CLOSE_LOCAL`)
// 을 그대로 읽는다. 휴장 캘린더는 US 만 유지 — 아시아·유럽은 주말만 skip.
// 점심 휴장은 regular 로 취급 (KIS 응답이 점심 봉을 반환하지 않아 자연 갭).

export type OverseasIndexSessionState = "regular" | "closed";

const OVERSEAS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

const getOverseasFormatter = (tz: string): Intl.DateTimeFormat => {
  const cached = OVERSEAS_FORMATTER_CACHE.get(tz);
  if (cached) return cached;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  OVERSEAS_FORMATTER_CACHE.set(tz, f);
  return f;
};

type OverseasLocalParts = { day: number; minutes: number; date: string };

const toOverseasLocalParts = (
  code: OverseasIndexCode,
  now: Date,
): OverseasLocalParts => {
  const parts = getOverseasFormatter(OVERSEAS_INDEX_TIMEZONE[code]).formatToParts(now);
  const bag: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") bag[p.type] = p.value;
  const hour = Number(bag.hour === "24" ? "00" : bag.hour); // en-US 24h 는 자정을 "24" 로 반환
  return {
    day: WEEKDAY_TO_INDEX[bag.weekday] ?? 0,
    minutes: hour * 60 + Number(bag.minute),
    date: `${bag.year}-${bag.month}-${bag.day}`,
  };
};

const hhmmToMinutes = (hhmm: string): number =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));

export const getOverseasIndexSessionState = (
  code: OverseasIndexCode,
  now: Date = new Date(),
): OverseasIndexSessionState => {
  const { day, minutes } = toOverseasLocalParts(code, now);
  if (day === 0 || day === 6) return "closed";
  const open = hhmmToMinutes(OVERSEAS_INDEX_OPEN_LOCAL[code]);
  const close = hhmmToMinutes(OVERSEAS_INDEX_CLOSE_LOCAL[code]);
  return minutes >= open && minutes < close ? "regular" : "closed";
};

// 당일 해외 지수 정규장 마감 이후 경과 분(거래소 로컬). 개장 전·주말이면 null.
// 휴장 캘린더는 `getOverseasIndexSessionState` 와 동일 정책(주말만 skip) — US 휴장은
// 미반영이나 마감 개념이 성립하지 않는 날이라 소비처에서 문제 되지 않는다.
export const minutesSinceOverseasIndexClose = (
  code: OverseasIndexCode,
  now: Date = new Date(),
): number | null => {
  const { day, minutes } = toOverseasLocalParts(code, now);
  if (day === 0 || day === 6) return null;
  const close = hhmmToMinutes(OVERSEAS_INDEX_CLOSE_LOCAL[code]);
  if (minutes < close) return null;
  return minutes - close;
};

const isOverseasTradingDay = (yyyyMmDd: string): boolean => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day !== 0 && day !== 6;
};

const findRecentOverseasTradingDay = (fromDate: string): string => {
  let d = fromDate;
  for (let i = 0; i < 15; i++) {
    if (isOverseasTradingDay(d)) return d;
    d = shiftUsDate(d, -1);
  }
  return d;
};

// getUsTradingDate 규칙 일반화: regular = 오늘(로컬 캘린더),
// 그 외(개장 전·마감·주말) = 어제부터 역방향으로 첫 트레이딩 데이(주말 skip).
// 아시아·유럽은 휴장 캘린더 없음 — 주말만 배제.
export const getOverseasIndexTradingDate = (
  code: OverseasIndexCode,
  now: Date = new Date(),
): string => {
  const { date } = toOverseasLocalParts(code, now);
  if (getOverseasIndexSessionState(code, now) === "regular") return date;
  return findRecentOverseasTradingDay(shiftUsDate(date, -1));
};

// fromDate 직전 트레이딩 데이 (지수별 캘린더). US 지수는 휴장 캘린더까지 반영해
// getPreviousUsTradingDate 로 위임, 그 외 거래소는 휴장 캘린더 부재로 주말만 skip.
export const getPreviousOverseasIndexTradingDate = (
  code: OverseasIndexCode,
  fromDate: string,
): string => {
  const tz = OVERSEAS_INDEX_TIMEZONE[code];
  if (tz === "America/New_York") return getPreviousUsTradingDate(fromDate);
  return findRecentOverseasTradingDay(shiftUsDate(fromDate, -1));
};
