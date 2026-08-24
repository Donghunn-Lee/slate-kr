import { describe, it, expect } from "vitest";
import { getPriceStats, rowToSnapshot } from "./prices";
import type { StockPriceSnapshot } from "@/shared/types/stock";

type DailyPriceRow = Parameters<typeof rowToSnapshot>[0];

const mkRow = (o: Partial<DailyPriceRow>): DailyPriceRow => ({
  id: 1,
  ticker: "TEST",
  date: new Date("2026-01-15T00:00:00Z"),
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1000,
  market_cap: null,
  ...o,
});

// getPriceStats는 내부에서 정렬하지 않고 prices[0]을 oldest, prices[last]를 current로 취급한다.
// 픽스처는 date 오름차순으로 구성한다.

const mkSnap = (o: Partial<StockPriceSnapshot>): StockPriceSnapshot => ({
  ticker: "TEST",
  date: "2026-01-01",
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: 0,
  marketCap: null,
  ...o,
});

describe("rowToSnapshot", () => {
  it("정상 봉: 값·형식 passthrough (date는 YYYY-MM-DD)", () => {
    const snap = rowToSnapshot(
      mkRow({ open: 100, high: 110, low: 90, close: 105, volume: 12345, market_cap: 999 })
    );
    expect(snap).toEqual({
      ticker: "TEST",
      date: "2026-01-15",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 12345,
      marketCap: 999,
    });
  });

  it("OHL=0 fill 봉: open/high/low를 close로 flat", () => {
    const snap = rowToSnapshot(mkRow({ open: 0, high: 0, low: 0, close: 5000, volume: 0 }));
    expect(snap.open).toBe(5000);
    expect(snap.high).toBe(5000);
    expect(snap.low).toBe(5000);
    expect(snap.close).toBe(5000);
    expect(snap.volume).toBe(0);
  });

  it("부분 0(open만 0)은 미변환 통과", () => {
    const snap = rowToSnapshot(mkRow({ open: 0, high: 110, low: 90, close: 105 }));
    expect(snap.open).toBe(0);
    expect(snap.high).toBe(110);
    expect(snap.low).toBe(90);
  });

  it("부분 0(low만 0)은 미변환 통과", () => {
    const snap = rowToSnapshot(mkRow({ open: 100, high: 110, low: 0, close: 105 }));
    expect(snap.low).toBe(0);
  });

  it("부분 0(high만 0)은 미변환 통과", () => {
    const snap = rowToSnapshot(mkRow({ open: 100, high: 0, low: 90, close: 105 }));
    expect(snap.high).toBe(0);
  });

  it("OHL=0 && close=0: 전부 0 유지 (flat 결과도 0)", () => {
    const snap = rowToSnapshot(mkRow({ open: 0, high: 0, low: 0, close: 0 }));
    expect(snap).toMatchObject({ open: 0, high: 0, low: 0, close: 0 });
  });

  it("volume·marketCap·date 매핑 보존 (marketCap null 포함)", () => {
    const snap = rowToSnapshot(
      mkRow({ date: new Date("2024-03-05T00:00:00Z"), volume: 7, market_cap: null })
    );
    expect(snap.date).toBe("2024-03-05");
    expect(snap.volume).toBe(7);
    expect(snap.marketCap).toBeNull();
  });
});

describe("getPriceStats", () => {
  describe("빈 배열", () => {
    it("range52w=null, returns 3개 전부 value=null", () => {
      const result = getPriceStats([]);
      expect(result.range52w).toBeNull();
      expect(result.returns).toEqual([
        { period: "1M", value: null },
        { period: "3M", value: null },
        { period: "1Y", value: null },
      ]);
    });
  });

  describe("range52w", () => {
    it("다중 요소: high=최대 high, low=최소 low, current=last.close, position 계산", () => {
      const prices = [
        mkSnap({ date: "2025-01-01", high: 120, low: 80, close: 100 }),
        mkSnap({ date: "2025-06-01", high: 150, low: 90, close: 140 }),
        mkSnap({ date: "2026-01-01", high: 130, low: 100, close: 125 }),
      ];
      const result = getPriceStats(prices);
      expect(result.range52w?.high).toBe(150);
      expect(result.range52w?.low).toBe(80);
      expect(result.range52w?.current).toBe(125);
      expect(result.range52w?.position).toBeCloseTo(45 / 70);
    });

    it("current == low → position 0", () => {
      const prices = [
        mkSnap({ date: "2025-01-01", high: 200, low: 100, close: 200 }),
        mkSnap({ date: "2026-01-01", high: 200, low: 100, close: 100 }),
      ];
      expect(getPriceStats(prices).range52w?.position).toBe(0);
    });

    it("current == high → position 1", () => {
      const prices = [
        mkSnap({ date: "2025-01-01", high: 100, low: 100, close: 100 }),
        mkSnap({ date: "2026-01-01", high: 200, low: 200, close: 200 }),
      ];
      expect(getPriceStats(prices).range52w?.position).toBe(1);
    });

    it("high === low → position 0 (0나눗셈 회피)", () => {
      const prices = [mkSnap({ date: "2026-01-01", high: 100, low: 100, close: 100 })];
      expect(getPriceStats(prices).range52w?.position).toBe(0);
    });

    it("365일 밖 극값은 무시 — 마지막 봉 기준 창 안에서만 max/min", () => {
      // 마지막 봉 2026-01-01 기준 cutoff = 2025-01-01.
      // 2024-06-01 봉의 초고가/초저가는 창 밖 → 제외돼야 함.
      const prices = [
        mkSnap({ date: "2024-06-01", high: 9999, low: 1, close: 500 }),
        mkSnap({ date: "2025-03-01", high: 150, low: 80, close: 120 }),
        mkSnap({ date: "2025-09-01", high: 180, low: 90, close: 160 }),
        mkSnap({ date: "2026-01-01", high: 170, low: 100, close: 140 }),
      ];
      const result = getPriceStats(prices);
      expect(result.range52w?.high).toBe(180);
      expect(result.range52w?.low).toBe(80);
    });

    it("이력 365일 미만: 전체 봉에서 극값 산출 (기존 동작)", () => {
      const prices = [
        mkSnap({ date: "2025-11-01", high: 120, low: 90, close: 100 }),
        mkSnap({ date: "2025-12-01", high: 150, low: 100, close: 130 }),
        mkSnap({ date: "2026-01-01", high: 140, low: 110, close: 125 }),
      ];
      const result = getPriceStats(prices);
      expect(result.range52w?.high).toBe(150);
      expect(result.range52w?.low).toBe(90);
    });
  });

  describe("calcReturn: 기간 커버 여부", () => {
    it("oldest > cutoff1Y → 1Y null (기간 커버 못함)", () => {
      const prices = [
        mkSnap({ date: "2025-06-01", close: 200 }),
        mkSnap({ date: "2026-01-01", close: 250 }),
      ];
      const oneY = getPriceStats(prices).returns.find((r) => r.period === "1Y")!;
      expect(oneY.value).toBeNull();
    });

    it("oldest ≤ cutoff1Y → basis (첫 p.date ≥ cutoff)의 close 대비 pct", () => {
      const prices = [
        mkSnap({ date: "2024-12-01", close: 100 }),
        mkSnap({ date: "2025-01-01", close: 200 }),
        mkSnap({ date: "2025-06-01", close: 220 }),
        mkSnap({ date: "2026-01-01", close: 250 }),
      ];
      const oneY = getPriceStats(prices).returns.find((r) => r.period === "1Y")!;
      expect(oneY.value).toBeCloseTo(25);
    });
  });

  describe("등락 부호 (1M)", () => {
    const build = (basisClose: number, currentClose: number): StockPriceSnapshot[] => [
      mkSnap({ date: "2025-11-01", close: basisClose }),
      mkSnap({ date: "2025-12-15", close: basisClose }),
      mkSnap({ date: "2026-01-15", close: currentClose }),
    ];

    it("상승: current > basis → 양수", () => {
      const r = getPriceStats(build(100, 110)).returns.find((x) => x.period === "1M")!;
      expect(r.value).toBeCloseTo(10);
    });

    it("하락: current < basis → 음수", () => {
      const r = getPriceStats(build(100, 90)).returns.find((x) => x.period === "1M")!;
      expect(r.value).toBeCloseTo(-10);
    });

    it("보합: current === basis → 0", () => {
      const r = getPriceStats(build(100, 100)).returns.find((x) => x.period === "1M")!;
      expect(r.value).toBe(0);
    });
  });
});
