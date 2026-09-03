import { describe, it, expect } from "vitest";
import { attachGrowthRates, calcDividendYield, calcGrowth, computeTtmEps } from "./financials";
import type { FinancialPeriod } from "@/shared/types/stock";

// computeTtmEps가 실제 참조하는 필드는 quarterly의 year/quarter/eps와 latestAnnual의 eps뿐.
// 나머지는 FinancialPeriod 타입 만족용 padding.
const makeFP = (o: Partial<FinancialPeriod>): FinancialPeriod => ({
  ticker: "TEST",
  year: 2025,
  quarter: null,
  reportType: "annual",
  revenue: null,
  operatingProfit: null,
  netIncome: null,
  totalAssets: null,
  totalEquity: null,
  eps: null,
  bps: null,
  per: null,
  pbr: null,
  operatingMargin: null,
  netMargin: null,
  debtRatio: null,
  roe: null,
  roa: null,
  dps: null,
  payoutRatio: null,
  dividendYield: null,
  revenueGrowth: null,
  operatingProfitGrowth: null,
  netIncomeGrowth: null,
  ...o,
});

const mkQ = (year: number, quarter: number, eps: number | null): FinancialPeriod =>
  makeFP({ year, quarter, reportType: "quarter", eps });

const mkA = (year: number, eps: number | null): FinancialPeriod =>
  makeFP({ year, quarter: null, reportType: "annual", eps });

describe("computeTtmEps", () => {
  describe("#1 TTM 정상", () => {
    it("최근 4분기 연속 non-null, 합 > 0 → { source: 'ttm', value: sum }", () => {
      // countTopConsecutive는 최신→과거 순서를 가정하며 Q4 뒤에는 다음해 Q1이 와야 연속으로 인정한다.
      const quarterly = [
        mkQ(2026, 1, 100),
        mkQ(2025, 4, 200),
        mkQ(2025, 3, 150),
        mkQ(2025, 2, 50),
      ];
      const result = computeTtmEps(quarterly, mkA(2025, 999));
      expect(result).toEqual({ value: 500, source: "ttm" });
    });
  });

  describe("#2 TTM 음수", () => {
    it("연속 4분기 합 < 0 → { source: 'ttm_negative', value: null }", () => {
      const quarterly = [
        mkQ(2026, 1, -100),
        mkQ(2025, 4, 50),
        mkQ(2025, 3, -200),
        mkQ(2025, 2, 100),
      ];
      const result = computeTtmEps(quarterly, mkA(2025, 999));
      expect(result).toEqual({ value: null, source: "ttm_negative" });
    });

    it("연속 4분기 합 = 0 → sum > 0 아님 → ttm_negative", () => {
      const quarterly = [
        mkQ(2026, 1, 100),
        mkQ(2025, 4, -100),
        mkQ(2025, 3, 50),
        mkQ(2025, 2, -50),
      ];
      const result = computeTtmEps(quarterly, mkA(2025, 999));
      expect(result).toEqual({ value: null, source: "ttm_negative" });
    });
  });

  describe("#3 연환산 (2~3분기 & 상장 <14개월)", () => {
    // MS_PER_MONTH가 30.44일 기준이라 365일은 약 11.99개월로 계산된다.
    const listedAt = new Date("2025-01-01T00:00:00Z");
    const now12mo = new Date("2026-01-01T00:00:00Z");

    it("3분기 연속 양수 → { source: 'annualized', value: sum*4/3 }", () => {
      const quarterly = [mkQ(2026, 3, 100), mkQ(2026, 2, 200), mkQ(2026, 1, 300)];
      const result = computeTtmEps(quarterly, mkA(2025, 999), listedAt, now12mo);
      expect(result.source).toBe("annualized");
      expect(result.value).toBeCloseTo(800);
    });

    it("2분기 연속 음수 합 → { source: 'annualized', value: null }", () => {
      const quarterly = [mkQ(2026, 2, -100), mkQ(2026, 1, -200)];
      const result = computeTtmEps(quarterly, mkA(2025, 999), listedAt, now12mo);
      expect(result).toEqual({ value: null, source: "annualized" });
    });
  });

  describe("#3 경계: 14개월 임계 (< 14 strict)", () => {
    const listedAt = new Date("2025-01-01T00:00:00Z");
    const nowUnder14 = new Date("2026-01-01T00:00:00Z"); // 약 11.99개월
    const nowOver14 = new Date("2026-04-01T00:00:00Z"); // 약 14.88개월

    const quarterly = [mkQ(2026, 3, 100), mkQ(2026, 2, 100), mkQ(2026, 1, 100)];
    const latestAnnual = mkA(2025, 500);

    it("14개월 미만 → annualized 진입", () => {
      const result = computeTtmEps(quarterly, latestAnnual, listedAt, nowUnder14);
      expect(result.source).toBe("annualized");
      expect(result.value).toBeCloseTo(400);
    });

    it("14개월 이상 → annual_fallback 폴스루", () => {
      const result = computeTtmEps(quarterly, latestAnnual, listedAt, nowOver14);
      expect(result).toEqual({ value: 500, source: "annual_fallback" });
    });
  });

  describe("#4 연간 폴백", () => {
    it("consecutive=1 (분기 부족) + latestAnnual.eps 존재 → annual_fallback", () => {
      const quarterly = [mkQ(2026, 1, 100)];
      const result = computeTtmEps(quarterly, mkA(2025, 500));
      expect(result).toEqual({ value: 500, source: "annual_fallback" });
    });

    it("consecutive=3인데 listedAt=null → 연환산 조건 불충족 → annual_fallback (폴스루)", () => {
      const quarterly = [mkQ(2026, 3, 100), mkQ(2026, 2, 100), mkQ(2026, 1, 100)];
      const result = computeTtmEps(quarterly, mkA(2025, 700), null);
      expect(result).toEqual({ value: 700, source: "annual_fallback" });
    });
  });

  describe("#5 데이터 없음", () => {
    it("quarterly=[] + latestAnnual=null → { source: 'none', value: null }", () => {
      const result = computeTtmEps([], null);
      expect(result).toEqual({ value: null, source: "none" });
    });

    it("quarterly=[] + latestAnnual.eps=null → { source: 'none', value: null }", () => {
      const result = computeTtmEps([], mkA(2025, null));
      expect(result).toEqual({ value: null, source: "none" });
    });
  });

  describe("가드: 순서/연속성 회귀", () => {
    it("분기 비연속 (2026Q1 → 2025Q3, Q4 누락) → consecutive 끊김 → annual_fallback", () => {
      const quarterly = [
        mkQ(2026, 1, 100),
        mkQ(2025, 3, 100),
        mkQ(2025, 2, 100),
        mkQ(2025, 1, 100),
      ];
      const result = computeTtmEps(quarterly, mkA(2025, 500));
      expect(result).toEqual({ value: 500, source: "annual_fallback" });
    });

    it("배열 상단 eps=null → 즉시 break, consecutive=0 → annual_fallback", () => {
      const quarterly = [
        mkQ(2026, 1, null),
        mkQ(2025, 4, 100),
        mkQ(2025, 3, 100),
        mkQ(2025, 2, 100),
      ];
      const result = computeTtmEps(quarterly, mkA(2025, 500));
      expect(result).toEqual({ value: 500, source: "annual_fallback" });
    });
  });

  describe("결정성: now 주입 이점", () => {
    it("동일 입력·동일 now → 항상 동일 결과 (실행 시점 무관)", () => {
      const listedAt = new Date("2025-01-01T00:00:00Z");
      const now = new Date("2026-01-01T00:00:00Z");
      const quarterly = [mkQ(2026, 3, 100), mkQ(2026, 2, 100), mkQ(2026, 1, 100)];
      const r1 = computeTtmEps(quarterly, mkA(2025, 500), listedAt, now);
      const r2 = computeTtmEps(quarterly, mkA(2025, 500), listedAt, now);
      expect(r1).toEqual(r2);
      expect(r1.source).toBe("annualized");
    });
  });
});

describe("calcDividendYield", () => {
  it("정상: dps/close (소수 규약, formatPercent 소비 전제)", () => {
    // 1446원 / 60000원 = 0.0241 → formatPercent 소비 시 "2.41%"
    expect(calcDividendYield(60000, 1446)).toBeCloseTo(0.0241, 6);
  });

  it("close === null → null", () => {
    expect(calcDividendYield(null, 1000)).toBeNull();
  });

  it("dps === 0 → null (배당 없음)", () => {
    expect(calcDividendYield(60000, 0)).toBeNull();
  });

  it("dps === null → null", () => {
    expect(calcDividendYield(60000, null)).toBeNull();
  });
});

describe("calcGrowth", () => {
  it("정상: (cur - prev) / prev, 소수 규약", () => {
    // 120 → 150: +25%. formatPercent 소비 시 "25.00%"
    expect(calcGrowth(150, 120)).toBeCloseTo(0.25, 6);
  });

  it("prev === 0 → null (0 나눗셈·발산)", () => {
    expect(calcGrowth(100, 0)).toBeNull();
  });

  it("prev < 0 → null (부호 뒤집힘, 흑자전환 표기 미도입)", () => {
    expect(calcGrowth(100, -50)).toBeNull();
  });

  it("cur === null → null", () => {
    expect(calcGrowth(null, 100)).toBeNull();
  });

  it("prev === null → null", () => {
    expect(calcGrowth(100, null)).toBeNull();
  });
});

describe("attachGrowthRates", () => {
  it("연간 3개년: 최고령 연도는 비교 대상 없어 null, 나머지는 전년 대비", () => {
    const periods = [
      makeFP({ year: 2025, revenue: 150, operatingProfit: 60, netIncome: 40 }),
      makeFP({ year: 2024, revenue: 120, operatingProfit: 50, netIncome: 30 }),
      makeFP({ year: 2023, revenue: 100, operatingProfit: 40, netIncome: 20 }),
    ];
    const out = attachGrowthRates(periods);
    expect(out[0].revenueGrowth).toBeCloseTo(0.25, 6);
    expect(out[0].operatingProfitGrowth).toBeCloseTo(0.2, 6);
    expect(out[0].netIncomeGrowth).toBeCloseTo(1 / 3, 6);
    expect(out[1].revenueGrowth).toBeCloseTo(0.2, 6);
    expect(out[1].operatingProfitGrowth).toBeCloseTo(0.25, 6);
    expect(out[1].netIncomeGrowth).toBeCloseTo(0.5, 6);
    // 최고령 = 2023, 2022 없음 → 전부 null
    expect(out[2].revenueGrowth).toBeNull();
    expect(out[2].operatingProfitGrowth).toBeNull();
    expect(out[2].netIncomeGrowth).toBeNull();
  });

  it("분기: 전년 동분기 매칭 (Q4 포함, 전분기 대비가 아니라 전년 동분기 대비)", () => {
    // 순서 뒤섞음: attachGrowthRates 는 정렬 가정 없음.
    const periods = [
      makeFP({ year: 2025, quarter: 4, reportType: "quarter", revenue: 200, operatingProfit: 80, netIncome: 50 }),
      makeFP({ year: 2024, quarter: 4, reportType: "quarter", revenue: 160, operatingProfit: 40, netIncome: 25 }),
      makeFP({ year: 2025, quarter: 1, reportType: "quarter", revenue: 110, operatingProfit: 22, netIncome: 11 }),
      makeFP({ year: 2024, quarter: 1, reportType: "quarter", revenue: 100, operatingProfit: 20, netIncome: 10 }),
    ];
    const out = attachGrowthRates(periods);
    // 2025Q4 vs 2024Q4
    expect(out[0].revenueGrowth).toBeCloseTo(0.25, 6);
    expect(out[0].operatingProfitGrowth).toBeCloseTo(1.0, 6);
    expect(out[0].netIncomeGrowth).toBeCloseTo(1.0, 6);
    // 2024Q4 는 전년 Q4 없음 → null
    expect(out[1].revenueGrowth).toBeNull();
    // 2025Q1 vs 2024Q1
    expect(out[2].revenueGrowth).toBeCloseTo(0.1, 6);
    expect(out[2].operatingProfitGrowth).toBeCloseTo(0.1, 6);
    expect(out[2].netIncomeGrowth).toBeCloseTo(0.1, 6);
    // 2024Q1 는 전년 Q1 없음 → null
    expect(out[3].revenueGrowth).toBeNull();
    // 입력 순서 그대로 반환
    expect(out.map((p) => `${p.year}Q${p.quarter}`)).toEqual([
      "2025Q4",
      "2024Q4",
      "2025Q1",
      "2024Q1",
    ]);
  });

  it("비교 행 없는 단독 행 → 3필드 null", () => {
    const periods = [makeFP({ year: 2025, revenue: 100, operatingProfit: 50, netIncome: 20 })];
    const out = attachGrowthRates(periods);
    expect(out[0].revenueGrowth).toBeNull();
    expect(out[0].operatingProfitGrowth).toBeNull();
    expect(out[0].netIncomeGrowth).toBeNull();
  });

  it("원본 배열·원본 요소 mutate 금지", () => {
    const orig2025 = makeFP({ year: 2025, revenue: 150 });
    const orig2024 = makeFP({ year: 2024, revenue: 120 });
    const periods = [orig2025, orig2024];
    const out = attachGrowthRates(periods);
    expect(out).not.toBe(periods);
    expect(out[0]).not.toBe(orig2025);
    expect(orig2025.revenueGrowth).toBeNull();
    expect(orig2024.revenueGrowth).toBeNull();
  });
});
