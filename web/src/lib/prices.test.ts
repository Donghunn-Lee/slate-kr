import { afterEach, describe, it, expect, vi } from "vitest";
import { getPriceStats, getRegularClose } from "./prices";
import { getDailyBar } from "@/lib/demo/price-model";
import { getDemoEntry } from "@/lib/demo/universe";
import { fetchStockQuote } from "@/lib/quote-source";
import type { StockPriceSnapshot } from "@/shared/types/stock";

// getRegularClose 는 생성기 경로 정합만 본다 — DB 는 universe 입력(종목 · 재무 · 첫 연도) 세 쿼리뿐이라 고정 행으로 대체.
vi.mock("@/lib/db", () => ({
  pool: {
    query: async (sql: string) =>
      sql.includes("FROM stocks")
        ? [[{ ticker: "005930", name: "삼성전자", market: "KOSPI", shares: 5_969_782_550 }], null]
        : sql.includes("MIN(year)")
          ? [[{ ticker: "005930", first_year: 2021 }], null]
          : [
              [
                {
                  ticker: "005930",
                  year: 2024,
                  has_financial: true,
                  eps: 4_950,
                  bps: 57_930,
                  net_income: 33_685_000_000_000,
                  dps: 1_446,
                  dart_yield: 2.7,
                },
              ],
              null,
            ],
  },
}));

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
  basePrice: null,
  ...o,
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

describe("getRegularClose — 생성기 일봉의 정규장(15:30) 종가", () => {
  const T = "005930";
  const kst = (date: string, hhmm: string): Date => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
  };
  // 2026-11-10(화) 거래일, 전후 휴장 없음. 그 주 금요일은 11-13, 토요일은 11-14.
  const TODAY = "2026-11-10";
  const PREV = "2026-11-09";
  const NEXT = "2026-11-11";
  const barOf = async (date: string) => getDailyBar(T, (await getDemoEntry(T))!.profile, date);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("지난 거래일: price = 일봉 regularClose, 등락 기준은 그 봉의 basePrice", async () => {
    const bar = await barOf(PREV);
    const basePrice = bar.basePrice as number;
    const result = await getRegularClose(T, PREV, kst(TODAY, "1000"));
    expect(result?.price).toBe(bar.regularClose);
    expect(result?.change).toBe(bar.regularClose - basePrice);
    expect(result?.changeRate).toBeCloseTo(((bar.regularClose - basePrice) / basePrice) * 100);
  });

  it("오늘 값은 15:30 부터 — 15:29 는 null, 15:30 은 같은 시각 J 현재가", async () => {
    expect(await getRegularClose(T, TODAY, kst(TODAY, "0900"))).toBeNull();
    expect(await getRegularClose(T, TODAY, kst(TODAY, "1529"))).toBeNull();

    vi.useFakeTimers({ now: kst(TODAY, "1530") });
    const result = await getRegularClose(T, TODAY);
    const quote = await fetchStockQuote(T, "J");
    expect(result).not.toBeNull();
    expect(result?.price).toBe(quote?.price);
    expect(result?.change).toBe(quote?.change);
  });

  it("20:00 마감 뒤에도 같은 값 — 일봉 close(애프터마켓 종가)가 아니다", async () => {
    const bar = await barOf(TODAY);
    expect((await getRegularClose(T, TODAY, kst(TODAY, "2100")))?.price).toBe(bar.regularClose);
    expect((await getRegularClose(T, TODAY, kst(NEXT, "0759")))?.price).toBe(bar.regularClose);
  });

  it("다음 거래일 일봉의 basePrice = 오늘 값", async () => {
    const result = await getRegularClose(T, TODAY, kst(TODAY, "1530"));
    expect((await barOf(NEXT)).basePrice).toBe(result?.price);
  });

  it("다음 거래일 값은 그 날 15:30 전까지 null", async () => {
    expect(await getRegularClose(T, NEXT, kst(TODAY, "2100"))).toBeNull();
    expect(await getRegularClose(T, NEXT, kst(NEXT, "1200"))).toBeNull();
  });

  it("토요일: 금요일 값이 나온다", async () => {
    const friday = await barOf("2026-11-13");
    const result = await getRegularClose(T, "2026-11-13", kst("2026-11-14", "1200"));
    expect(result?.price).toBe(friday.regularClose);
  });

  it("미등록 ticker · 이력 시작 전 → null", async () => {
    expect(await getRegularClose("000000", PREV, kst(TODAY, "1000"))).toBeNull();
    expect(await getRegularClose(T, "2015-12-30", kst(TODAY, "1000"))).toBeNull();
  });
});
