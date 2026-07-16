import { describe, it, expect } from "vitest";
import { getTickSize } from "./getTickSize";

describe("getTickSize", () => {
  describe("구간 내부값", () => {
    it("1원 → 1", () => expect(getTickSize(1)).toBe(1));
    it("1000원 → 1", () => expect(getTickSize(1000)).toBe(1));
    it("3000원 → 5", () => expect(getTickSize(3000)).toBe(5));
    it("10000원 → 10", () => expect(getTickSize(10000)).toBe(10));
    it("30000원 → 50", () => expect(getTickSize(30000)).toBe(50));
    it("100000원 → 100", () => expect(getTickSize(100000)).toBe(100));
    it("300000원 → 500", () => expect(getTickSize(300000)).toBe(500));
    it("1000000원 → 1000 (상한 없는 최상단 구간)", () => expect(getTickSize(1_000_000)).toBe(1000));
  });

  // 경계값 자체는 상위 구간에 속함 (strict `<`).
  describe("구간 경계", () => {
    it("1999 → 1", () => expect(getTickSize(1999)).toBe(1));
    it("2000 → 5", () => expect(getTickSize(2000)).toBe(5));
    it("4999 → 5", () => expect(getTickSize(4999)).toBe(5));
    it("5000 → 10", () => expect(getTickSize(5000)).toBe(10));
    it("19999 → 10", () => expect(getTickSize(19999)).toBe(10));
    it("20000 → 50", () => expect(getTickSize(20000)).toBe(50));
    it("49999 → 50", () => expect(getTickSize(49999)).toBe(50));
    it("50000 → 100", () => expect(getTickSize(50000)).toBe(100));
    it("199999 → 100", () => expect(getTickSize(199999)).toBe(100));
    it("200000 → 500", () => expect(getTickSize(200000)).toBe(500));
    it("499999 → 500", () => expect(getTickSize(499999)).toBe(500));
    it("500000 → 1000", () => expect(getTickSize(500000)).toBe(1000));
  });

  it("0 → 1 (최저 구간)", () => expect(getTickSize(0)).toBe(1));
});
