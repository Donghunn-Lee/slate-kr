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
const YESTERDAY = "2026-07-28";

// KST 시각을 fake-utc epoch sec 로 인코딩 (kis-quote-fetch 의 kstToFakeUtcSec 와 동형).
// 테스트에서는 순환 의존 피해 로컬 helper 로 재구현.
const fakeUtcSec = (yyyyMmDd: string, hhmm: string): number => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const h = Number(hhmm.slice(0, 2));
  const min = Number(hhmm.slice(2, 4));
  return Math.floor(Date.UTC(y, m - 1, d, h, min, 0) / 1000);
};

// 정상 병합 시나리오 대부분은 "오늘" 봉 대상 → 편의 상수.
const T = (hhmm: string): number => fakeUtcSec(TODAY, hhmm);

describe("mergeLiveIntradayBar", () => {
  describe("정상 병합", () => {
    it("마지막 봉 close 를 quote.price 로 대체 (high/low 범위 내)", () => {
      const bars = [
        bar(T("1000"), { open: 100, high: 108, low: 95, close: 102 }),
        bar(T("1001"), { open: 102, high: 106, low: 100, close: 103 }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result).toHaveLength(2);
      expect(result[1].close).toBe(105);
      expect(result[1].high).toBe(106); // 기존 high 유지 (105 < 106)
      expect(result[1].low).toBe(100); // 기존 low 유지 (105 > 100)
    });

    it("quote.price 가 기존 high 보다 크면 high 확장", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(result[0].high).toBe(108);
      expect(result[0].low).toBe(99);
      expect(result[0].close).toBe(108);
    });

    it("quote.price 가 기존 low 보다 작으면 low 확장", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 95 }), TODAY, TODAY, false);
      expect(result[0].low).toBe(95);
      expect(result[0].high).toBe(103);
      expect(result[0].close).toBe(95);
    });

    it("volume 은 불변", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 }, 7_777)];
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
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result[0].open).toBe(100);
    });

    it("마지막 봉만 변경 — 이전 봉은 참조 그대로 유지", () => {
      const first = bar(T("1000"), { open: 100, high: 108, low: 95, close: 102 });
      const bars = [first, bar(T("1001"), { open: 102, high: 106, low: 100, close: 103 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result[0]).toBe(first); // 참조 동일
    });

    it("새 봉 append 금지 — 길이 불변", () => {
      const bars = [
        bar(T("1000"), { open: 100, high: 108, low: 95, close: 102 }),
        bar(T("1001"), { open: 102, high: 106, low: 100, close: 103 }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 105 }), TODAY, TODAY, false);
      expect(result).toHaveLength(bars.length);
    });
  });

  describe("스킵 가드 (원본 참조 반환)", () => {
    it("previousDay=true → 원본", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, TODAY, true);
      expect(result).toBe(bars);
    });

    it("quoteDate ≠ chartTradingDate → 원본", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), "2026-07-28", TODAY, false);
      expect(result).toBe(bars);
    });

    it("bars 빈 배열 → 원본", () => {
      const bars: ChartBar[] = [];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quote.price === last.close → 원본 (참조 변경 방지)", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote({ price: 101 }), TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quote=null → 원본", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, null, TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("quoteDate undefined → 원본", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), undefined, TODAY, false);
      expect(result).toBe(bars);
    });

    it("chartTradingDate undefined → 원본", () => {
      const bars = [bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 })];
      const result = mergeLiveIntradayBar(bars, quote(), TODAY, undefined, false);
      expect(result).toBe(bars);
    });

    it("스냅샷 quote (OHL 삼중 0) → 원본 (프리오픈 08:50~09:00 latePreopen 케이스)", () => {
      // quote_snapshots.snapshotToQuote 는 open/high/low 를 명시적 0 으로 채움.
      // price 는 어제 20:00 UN 종가 → 오늘 08:50 pre 봉 close 를 어제 값으로 덮어쓰면 안 됨.
      const bars = [
        bar(T("0850"), { open: 100, high: 103, low: 99, close: 102 }),
      ];
      const snapshot = quote({ open: 0, high: 0, low: 0, price: 95 });
      const result = mergeLiveIntradayBar(bars, snapshot, TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("마지막 봉이 어제 tail-only (프리세션 비NXT) → 원본", () => {
      // 08:00~09:00 프리세션 비NXT: bars = [어제 15:00~15:30 tail], chartTradingDate = 오늘.
      // 오늘 quote 로 어제 tail 마지막 봉을 덮어쓰면 안 됨.
      const bars = [
        bar(fakeUtcSec(YESTERDAY, "1529"), {
          open: 100,
          high: 103,
          low: 99,
          close: 101,
        }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(result).toBe(bars);
    });

    it("tail + 오늘 봉 혼합 (프리세션 NXT) → 오늘 마지막 봉 병합", () => {
      // NXT 프리세션: bars = [어제 tail, ..., 오늘 08:20 pre 봉]. 마지막 봉은 오늘 → 병합 대상.
      const bars = [
        bar(fakeUtcSec(YESTERDAY, "1959"), {
          open: 100,
          high: 103,
          low: 99,
          close: 101,
        }),
        bar(fakeUtcSec(TODAY, "0820"), {
          open: 102,
          high: 106,
          low: 100,
          close: 103,
        }),
      ];
      const result = mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(result[0]).toBe(bars[0]); // tail 봉 참조 유지
      expect(result[1].close).toBe(108);
      expect(result[1].high).toBe(108);
    });
  });

  describe("불변성", () => {
    it("원본 배열 및 마지막 봉 객체를 뮤테이트하지 않음", () => {
      const last = bar(T("1000"), { open: 100, high: 103, low: 99, close: 101 });
      const bars = [last];
      const snapshotLen = bars.length;
      const snapshotLast = { ...last };
      mergeLiveIntradayBar(bars, quote({ price: 108 }), TODAY, TODAY, false);
      expect(bars.length).toBe(snapshotLen);
      expect(bars[0]).toEqual(snapshotLast);
    });
  });
});
