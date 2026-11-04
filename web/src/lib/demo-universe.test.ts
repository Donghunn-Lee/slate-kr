import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getTickerProfile } from "./demo-price-model";

const query = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

type StockFixture = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  shares: number | null;
  listed_at: string | null;
};
type YearlyFixture = {
  ticker: string;
  year: number;
  has_financial: boolean;
  eps: number | null;
  bps: number | null;
  net_income: number | null;
  dps: number | null;
  dart_yield: number | null;
};

const STOCKS: StockFixture[] = [
  { ticker: "005930", name: "삼성전자", market: "KOSPI", shares: 5_969_782_550, listed_at: "1975-06-11" },
  { ticker: "999990", name: "신규", market: "KOSDAQ", shares: null, listed_at: "2026-03-02" },
];
// 005930: 2024 는 정상 핀, 2025 는 EPS 기준 주식수가 현재의 1/10 이라 핀 제외, 2023 은 무배당.
const YEARLY: YearlyFixture[] = [
  { ticker: "005930", year: 2023, has_financial: true, eps: 2_131, bps: 52_002, net_income: 14_473_401_000_000, dps: null, dart_yield: null },
  { ticker: "005930", year: 2024, has_financial: true, eps: 4_950, bps: 57_930, net_income: 33_685_000_000_000, dps: 1_446, dart_yield: 2.7 },
  { ticker: "005930", year: 2025, has_financial: true, eps: 50_000, bps: 60_000, net_income: 30_000_000_000_000, dps: 1_500, dart_yield: 3 },
  { ticker: "999990", year: 2025, has_financial: false, eps: null, bps: null, net_income: null, dps: 100, dart_yield: 1 },
];

describe("demo-universe", () => {
  beforeEach(() => {
    vi.resetModules();
    query.mockReset();
    query.mockImplementation(async (sql: string) =>
      sql.includes("FROM stocks") ? [STOCKS, null] : [YEARLY, null],
    );
    vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("핀 = DPS ÷ 시가배당률, 최신 연간 행의 EPS·BPS 가 앵커 재무", async () => {
    const { getDemoEntry } = await import("./demo-universe");
    const entry = await getDemoEntry("005930");
    expect(entry).not.toBeNull();
    expect(entry?.shares).toBe(5_969_782_550);
    expect(entry?.listedAt).toBe("1975-06-11");
    expect(entry?.profile).toEqual(
      getTickerProfile("005930", {
        eps: 50_000,
        bps: 60_000,
        pins: [{ date: "2024-12-31", price: 1_446 / 0.027 }],
      }),
    );
  });

  it("기준 주식수 불일치 해의 배당은 핀에서 빠지고, 재무 없는 종목은 핀만으로 프로필을 만든다", async () => {
    const { getDemoEntry } = await import("./demo-universe");
    const samsung = await getDemoEntry("005930");
    expect(samsung?.profile.pins.map((p) => p.date)).toEqual(["2024-12-30"]);
    const fresh = await getDemoEntry("999990");
    expect(fresh?.shares).toBeNull();
    expect(fresh?.profile).toEqual(
      getTickerProfile("999990", {
        eps: null,
        bps: null,
        pins: [{ date: "2025-12-31", price: 100 / 0.01 }],
      }),
    );
    expect(await getDemoEntry("000000")).toBeNull();
  });

  it("1시간 안에는 SQL 을 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    const { getDemoUniverse, getDemoEntry } = await import("./demo-universe");
    expect(await getDemoUniverse()).toHaveLength(2);
    await getDemoEntry("005930");
    expect(query).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(59 * 60 * 1000);
    await getDemoUniverse();
    expect(query).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2 * 60 * 1000);
    await getDemoUniverse();
    expect(query).toHaveBeenCalledTimes(4);
  });
});
