import { describe, it, expect } from "vitest";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";
import { isClosedLikeMiss, isPreMarketReset } from "./StockHeaderLivePrice";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-07-23 은 목요일 거래일, 2026-07-25 는 토요일, 2026-01-01 은 휴장일.
const TRADING_DAY = { y: 2026, m: 7, d: 23 };
const t = (h: number, min = 0): Date =>
  kst(TRADING_DAY.y, TRADING_DAY.m, TRADING_DAY.d, h, min);

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
  ...over,
});

describe("isPreMarketReset — 정규장 개장 전 KRX 기준 0% 리셋 창", () => {
  it("07:30 preopen · live=null → false (이른 preopen 은 창 밖)", () => {
    expect(isPreMarketReset("preopen", null, t(7, 30))).toBe(false);
  });
  it("08:20 pre · live=null → true (KRX-only 종목, NX 응답 null)", () => {
    expect(isPreMarketReset("pre", null, t(8, 20))).toBe(true);
  });
  it("08:20 pre · live 있음 → false (NXT 종목은 프리마켓 실봉 표시)", () => {
    expect(isPreMarketReset("pre", q(), t(8, 20))).toBe(false);
  });
  it("08:55 preopen · live=null → true (늦은 preopen 도 창 안)", () => {
    expect(isPreMarketReset("preopen", null, t(8, 55))).toBe(true);
  });
  it("08:55 preopen · live 있음 → false (live 제외 조건은 창 전체에 적용)", () => {
    expect(isPreMarketReset("preopen", q(), t(8, 55))).toBe(false);
  });
  it("09:10 regular → false", () => {
    expect(isPreMarketReset("regular", q(), t(9, 10))).toBe(false);
    expect(isPreMarketReset("regular", null, t(9, 10))).toBe(false);
  });
  it("after / after_close / closed → false (isClosedLikeMiss 경로)", () => {
    expect(isPreMarketReset("after", null, t(16, 0))).toBe(false);
    expect(isPreMarketReset("after_close", null, t(21, 0))).toBe(false);
    expect(isPreMarketReset("closed", null, kst(2026, 7, 25, 10, 0))).toBe(false);
  });
  it("휴장일 08:30 → false (창 시각이어도 거래일이 아니면 리셋 없음)", () => {
    expect(isPreMarketReset("closed", null, kst(2026, 1, 1, 8, 30))).toBe(false);
  });
  it("08:55 · 서버 session 이 stale 한 after_close → false (세션 게이트)", () => {
    // preopen 구간엔 폴링이 멈춰 전날 저녁 응답이 남을 수 있다. 시계만 보면 창 안이지만
    // 세션이 개장 전이 아니므로 isClosedLikeMiss 경로에 그대로 맡긴다.
    expect(isPreMarketReset("after_close", null, t(8, 55))).toBe(false);
  });
  it("now=null → false (SSR·첫 렌더)", () => {
    expect(isPreMarketReset("pre", null, null)).toBe(false);
  });
  it("undefined session · 08:20 → false (초기 로드 스켈레톤)", () => {
    expect(isPreMarketReset(undefined, null, t(8, 20))).toBe(false);
  });
});

describe("isClosedLikeMiss — after 계열/closed 의 KRX-only 폴백 창", () => {
  it("after · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("after", null, false)).toBe(true);
  });
  it("after_close · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("after_close", null, false)).toBe(true);
  });
  it("closed · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("closed", null, false)).toBe(true);
  });
  it("pre · live=null → false (isPreMarketReset 이 처리)", () => {
    expect(isClosedLikeMiss("pre", null, false)).toBe(false);
  });
  it("preopen · live=null → false (isPreMarketReset 이 처리)", () => {
    expect(isClosedLikeMiss("preopen", null, false)).toBe(false);
  });
  it("regular · live=null → false", () => {
    expect(isClosedLikeMiss("regular", null, false)).toBe(false);
  });
  it("after · live 있음 → false (live NXT 값 사용)", () => {
    expect(isClosedLikeMiss("after", q(), false)).toBe(false);
  });
  it("after · live=null · failed=true → false (KIS 실패는 별도 배지, 폴백 아님)", () => {
    expect(isClosedLikeMiss("after", null, true)).toBe(false);
  });
  it("undefined → false", () => {
    expect(isClosedLikeMiss(undefined, null, false)).toBe(false);
  });
});

// 두 술어가 상호 배타적이어야 표시 분기(preReset / closedLike)가 안전하다.
// 두 술어 모두 세션 집합이 서로 겹치지 않으므로, 서버 세션이 클라 시계와 어긋난
// 조합(폴링이 멈춘 구간의 stale 응답) 까지 포함해 시각 전 범위를 훑는다.
describe("두 술어의 상호 배타성", () => {
  const SESSIONS: KrxSession[] = [
    "regular", "after", "after_close", "pre", "preopen", "closed",
  ];
  const NOWS: Date[] = [
    t(7, 30), t(8, 20), t(8, 55), t(10, 0), t(16, 0), t(21, 0),
    kst(2026, 7, 25, 10, 0), // 토요일
    kst(2026, 1, 1, 8, 30), // 휴장일 · 창 시각
  ];
  const LIVES: (StockQuote | null)[] = [null, q()];

  for (const s of SESSIONS) {
    for (const live of LIVES) {
      it(`${s} · live=${live === null ? "null" : "quote"} → 어느 시각에도 동시 true 없음`, () => {
        for (const now of NOWS) {
          const pre = isPreMarketReset(s, live, now);
          const closed = isClosedLikeMiss(s, live, false);
          expect(pre && closed).toBe(false);
        }
      });
    }
  }
});
