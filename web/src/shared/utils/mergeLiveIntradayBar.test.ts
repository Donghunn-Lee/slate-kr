import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import type { LiveQuoteForMerge } from "./mergeLiveDayBar";
import { mergeLiveIntradayBar } from "./mergeLiveIntradayBar";

// intraday 봉의 time 은 kstToFakeUtcSec 로 인코딩된 number.
// 값 자체는 unit test 에서 순수 산술만 검증하므로 임의의 epoch sec 로 채운다.
const bar = (
  time: number,
  ohlc: { open: number; high: number; low: number; close: number },
  volume: number = 1_000,
): ChartBar => ({ time, ...ohlc, volume });

const quote = (over: Partial<LiveQuoteForMerge> = {}): LiveQuoteForMerge => ({
  open: 100,
  high: 110,
  low: 90,
  price: 105,
  volume: 5_000,
  ...over,
});

const TODAY = "2026-07-29";

describe("mergeLiveIntradayBar", () => {
  describe("정상 병합", () => {
    it("마지막 봉 close 를 quote.price 로 대체 (high/low 범위 내)", () => {
      const bars = [
        bar(1000, { open: 100, high: 108, low: 95, close: 102 }),
        bar(1060, { open: 102, high: 106, low: 100, close: 103 }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result).toHaveLength(2);
      expect(result[1].close).toBe(105);
      expect(result[1].high).toBe(106); // 기존 high 유지 (105 < 106)
      expect(result[1].low).toBe(100); // 기존 low 유지 (105 > 100)
    });

    it("quote.price 가 기존 high 보다 크면 high 확장", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(result[0].high).toBe(108);
      expect(result[0].low).toBe(99);
      expect(result[0].close).toBe(108);
    });

    it("quote.price 가 기존 low 보다 작으면 low 확장", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 95 }), TODAY, TODAY, false);
      expect(result[0].low).toBe(95);
      expect(result[0].high).toBe(103);
      expect(result[0].close).toBe(95);
    });

    it("volume 은 불변", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 }, 7_777)];
      const result = mergeLiveIntradayBar(
        bars,
        quote({ price: 105, volume: 999_999 }),
        TODAY,
        TODAY,
        false,
      );
      expect(result[0].volume).toBe(7_777);
    });

    it("open 은 불변 (첫 체결가 보존)", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result[0].open).toBe(100);
    });

    it("마지막 봉만 변경 — 이전 봉은 참조 그대로 유지", () => {
      const first = bar(1000, { open: 100, high: 108, low: 95, close: 102 });
      const bars = [first, bar(1060, { open: 102, high: 106, low: 100, close: 103 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result[0]).toBe(first); // 참조 동일
    });

    it("새 봉 append 금지 — 길이 불변", () => {
      const bars = [
        bar(1000, { open: 100, high: 108, low: 95, close: 102 }),
        bar(1060, { open: 102, high: 106, low: 100, close: 103 }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result).toHaveLength(bars.length);
    });
  });

  describe("스킵 가드 (원본 참조 반환)", () => {
    it("previousDay=true → 원본", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, TODAY, true);
      expect(result).toBe(bars);
    });

    it("quoteDate ≠ chartTradingDate → 원본", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), "2026-07-28", TODAY, false);
      expect(result).toBe(bars);
    });

    it("bars 빈 배열 → 원본", () => {
      const bars: ChartBar[] = [];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quote.price === last.close → 원본 (참조 변경 방지)", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 101 }), TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quote=null → 원본", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, null, TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quoteDate undefined → 원본", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), undefined, TODAY, false);
      expect(result).toBe(bars);
    });

    it("chartTradingDate undefined → 원본", () => {
      const bars = [bar(1000, { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, undefined, false);
      expect(result).toBe(bars);
    });
  });

  describe("불변성", () => {
    it("원본 배열 및 마지막 봉 객체를 뮤테이트하지 않음", () => {
      const last = bar(1000, { open: 100, high: 103, low: 99, close: 101 });
      const bars = [last];
      const snapshotLen = bars.length;
      const snapshotLast = { ...last };
      mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(bars.length).toBe(snapshotLen);
      expect(bars[0]).toEqual(snapshotLast);
    });
  });
});
