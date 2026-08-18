import { describe, it, expect } from "vitest";
import type { StockQuote } from "@/shared/types/quote";
import { isClosedLikeMiss, isPreMarketReset } from "./StockHeaderLivePrice";

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
  it("preopen · live=null → true (06:00~08:00, 08:50~09:00)", () => {
    expect(isPreMarketReset("preopen", null)).toBe(true);
  });
  it("preopen · live 있음 → true (세션 자체가 리셋 창)", () => {
    expect(isPreMarketReset("preopen", q())).toBe(true);
  });
  it("pre · live=null → true (KRX-only 종목, NX 응답 null)", () => {
    expect(isPreMarketReset("pre", null)).toBe(true);
  });
  it("pre · live 있음 → false (NXT 종목은 프리마켓 실봉 표시)", () => {
    expect(isPreMarketReset("pre", q())).toBe(false);
  });
  it("regular → false", () => {
    expect(isPreMarketReset("regular", q())).toBe(false);
    expect(isPreMarketReset("regular", null)).toBe(false);
  });
  it("after / after_close / closed → false (isClosedLikeMiss 경로)", () => {
    expect(isPreMarketReset("after", null)).toBe(false);
    expect(isPreMarketReset("after_close", null)).toBe(false);
    expect(isPreMarketReset("closed", null)).toBe(false);
  });
  it("undefined → false (초기 로드 스켈레톤)", () => {
    expect(isPreMarketReset(undefined, null)).toBe(false);
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
describe("두 술어의 상호 배타성", () => {
  const SESSIONS = ["regular", "after", "after_close", "pre", "preopen", "closed"] as const;
  const LIVES: (StockQuote | null)[] = [null, q()];

  for (const s of SESSIONS) {
    for (const live of LIVES) {
      it(`${s} · live=${live === null ? "null" : "quote"} → 두 술어 동시 true 없음`, () => {
        const pre = isPreMarketReset(s, live);
        const closed = isClosedLikeMiss(s, live, false);
        expect(pre && closed).toBe(false);
      });
    }
  }
});
