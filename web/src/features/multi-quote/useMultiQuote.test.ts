import { describe, it, expect } from "vitest";
import { isPreMarketReset } from "@/entities/stock/stockHeaderLabel";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-07-23 은 목요일 거래일, 2026-01-01 은 휴장일.
const t = (h: number, min = 0): Date => kst(2026, 7, 23, h, min);

const q = (over: Partial<StockQuote> = {}): StockQuote => ({
  ticker: "000660",
  price: 1_711_000,
  change: 3_000,
  changeRate: 0.18,
  sign: "up",
  open: 1_713_000,
  high: 1_736_000,
  low: 1_698_000,
  volume: 100_000,
  source: "krx",
  ...over,
});

// useMultiQuote 가 소비측에 넘기는 축. 리스트 표면엔 KRX/NXT 탭이 없어 market 은 "krx" 고정.
const listPreReset = (session: KrxSession | undefined, now: Date | null): boolean =>
  isPreMarketReset(session, "krx", now);

// 리스트 표면 3곳(WatchlistRow · WatchlistPreview · SearchResultList)이 공유하는 조립식.
// 공용 헬퍼로 추출하지 않으므로 StockHeaderLivePrice.test.ts 의 tabSession 관례대로
// 테스트에 복제해 고정한다. eod=null 은 EOD 행 부재(폴백 팔 자체가 없음).
type Eod = { change: number | null; changePct: number | null } | null;
const displayChange = (
  live: StockQuote | null, eod: Eod, preReset: boolean,
): number | null =>
  live !== null ? live.change : preReset && eod ? 0 : (eod?.change ?? null);
const displayChangeRate = (
  live: StockQuote | null, eod: Eod, preReset: boolean,
): number | null =>
  live !== null ? live.changeRate : preReset && eod ? 0 : (eod?.changePct ?? null);

const EOD: Eod = { change: 1_150, changePct: 2.4 };

describe("useMultiQuote preReset — 리스트 표면의 KRX 고정 축", () => {
  it("08:20 pre → true", () => {
    expect(listPreReset("pre", t(8, 20))).toBe(true);
  });
  it("08:55 늦은 preopen → true", () => {
    expect(listPreReset("preopen", t(8, 55))).toBe(true);
  });
  it("07:30 이른 preopen → false (창 밖 — 직전 마감 표면 유지)", () => {
    expect(listPreReset("preopen", t(7, 30))).toBe(false);
  });
  it("09:10 regular → false", () => {
    expect(listPreReset("regular", t(9, 10))).toBe(false);
  });
  it("16:00 after → false", () => {
    expect(listPreReset("after", t(16, 0))).toBe(false);
  });
  it("휴장일 08:30 → false", () => {
    expect(listPreReset("closed", kst(2026, 1, 1, 8, 30))).toBe(false);
  });
  it("응답 전 session=undefined → false (헤더 pre-mount 와 동형)", () => {
    expect(listPreReset(undefined, t(8, 55))).toBe(false);
  });
  it("now=null (pre-mount) → false", () => {
    expect(listPreReset("pre", null)).toBe(false);
  });
});

describe("리스트 표면 조립식 — 리셋은 EOD 폴백 팔에만", () => {
  it("preReset=true · live 있음 → 라이브 값 보존 (오늘 축이라 손대지 않음)", () => {
    expect(displayChange(q(), EOD, true)).toBe(3_000);
    expect(displayChangeRate(q(), EOD, true)).toBe(0.18);
  });
  it("preReset=true · live 없음 · EOD 있음 → 0 (전일 등락 제거)", () => {
    expect(displayChange(null, EOD, true)).toBe(0);
    expect(displayChangeRate(null, EOD, true)).toBe(0);
  });
  it("preReset=false · live 없음 · EOD 있음 → EOD 값", () => {
    expect(displayChange(null, EOD, false)).toBe(1_150);
    expect(displayChangeRate(null, EOD, false)).toBe(2.4);
  });
  it("preReset=true · live 없음 · EOD 없음 → null (0 아님 — 표시할 값 자체가 없음)", () => {
    expect(displayChange(null, null, true)).toBeNull();
    expect(displayChangeRate(null, null, true)).toBeNull();
  });
  it("preReset=true · live 없음 · EOD 행은 있으나 등락 결측 → 0", () => {
    const partial: Eod = { change: null, changePct: null };
    expect(displayChange(null, partial, true)).toBe(0);
    expect(displayChangeRate(null, partial, true)).toBe(0);
  });
});
