import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getTickerProfile } from "./price-model";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

type StockFixture = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  shares: number | null;
};
type FirstYearFixture = { ticker: string; first_year: number };
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
  { ticker: "005930", name: "삼성전자", market: "KOSPI", shares: 5_969_782_550 },
  { ticker: "999990", name: "신규", market: "KOSDAQ", shares: null },
  { ticker: "123450", name: "중견", market: "KOSDAQ", shares: 10_000_000 },
  { ticker: "777770", name: "스팩", market: "KOSDAQ", shares: 5_000_000 },
];
// 005930: 2024 는 정상 핀, 2025 는 EPS 기준 주식수가 현재의 1/10 이라 핀 제외, 2023 은 무배당.
// 123450: 핀이 없어 앵커가 최신 연간 EPS 로 정해진다 — 2026 행을 읽으면 프로필이 달라진다.
const YEARLY: YearlyFixture[] = [
  {
    ticker: "005930",
    year: 2023,
    has_financial: true,
    eps: 2_131,
    bps: 52_002,
    net_income: 14_473_401_000_000,
    dps: null,
    dart_yield: null,
  },
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
  {
    ticker: "005930",
    year: 2025,
    has_financial: true,
    eps: 50_000,
    bps: 60_000,
    net_income: 30_000_000_000_000,
    dps: 1_500,
    dart_yield: 3,
  },
  {
    ticker: "999990",
    year: 2025,
    has_financial: false,
    eps: null,
    bps: null,
    net_income: null,
    dps: 100,
    dart_yield: 1,
  },
  {
    ticker: "123450",
    year: 2025,
    has_financial: true,
    eps: 1_000,
    bps: 12_000,
    net_income: 10_000_000_000,
    dps: null,
    dart_yield: null,
  },
  {
    ticker: "123450",
    year: 2026,
    has_financial: true,
    eps: 3_000,
    bps: 30_000,
    net_income: 30_000_000_000,
    dps: 500,
    dart_yield: 2,
  },
];
// 999990 은 배당 행만으로 첫 연도가 잡히고, 777770 은 재무 · 배당 행이 둘 다 없어 결과에 없다.
const FIRST_YEARS: FirstYearFixture[] = [
  { ticker: "005930", first_year: 2021 },
  { ticker: "123450", first_year: 2023 },
  { ticker: "999990", first_year: 2025 },
];

describe("demo/universe", () => {
  beforeEach(() => {
    vi.resetModules();
    query.mockReset();
    query.mockImplementation(async (sql: string) =>
      sql.includes("FROM stocks")
        ? [STOCKS, null]
        : sql.includes("MIN(year)")
          ? [FIRST_YEARS, null]
          : [YEARLY, null]
    );
    vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("핀 = DPS ÷ 시가배당률, 최신 연간 행의 EPS·BPS 가 앵커 재무", async () => {
    const { getDemoEntry } = await import("./universe");
    const entry = await getDemoEntry("005930");
    expect(entry).not.toBeNull();
    expect(entry?.shares).toBe(5_969_782_550);
    expect(entry?.profile).toEqual(
      getTickerProfile("005930", {
        eps: 50_000,
        bps: 60_000,
        pins: [{ date: "2024-12-31", price: 1_446 / 0.027 }],
        shares: 5_969_782_550,
      })
    );
  });

  it("기준 주식수 불일치 해의 배당은 핀에서 빠지고, 재무 없는 종목은 핀만으로 프로필을 만든다", async () => {
    const { getDemoEntry } = await import("./universe");
    const samsung = await getDemoEntry("005930");
    expect(samsung?.profile.pins.map((p) => p.date)).toEqual(["2024-12-30"]);
    const fresh = await getDemoEntry("999990");
    expect(fresh?.shares).toBeNull();
    expect(fresh?.profile).toEqual(
      getTickerProfile("999990", {
        eps: null,
        bps: null,
        pins: [{ date: "2025-12-31", price: 100 / 0.01 }],
      })
    );
    expect(await getDemoEntry("000000")).toBeNull();
  });

  it("DEMO_ANCHOR_YEAR 뒤 연도의 재무 · 배당은 앵커 재무 · 핀에 안 들어간다", async () => {
    const { getDemoEntry } = await import("./universe");
    const entry = await getDemoEntry("123450");
    expect(entry?.profile).toEqual(
      getTickerProfile("123450", { eps: 1_000, bps: 12_000, pins: [], shares: 10_000_000 })
    );
  });

  it("이력 시작 = 첫 연도 1월 1일, 수집 창 첫 해(2021)면 DEMO_HISTORY_START, 재무 · 배당 행 없으면 앵커 연도", async () => {
    const { getDemoEntry, getDemoHistoryStart, DEMO_HISTORY_START } = await import("./universe");
    const startOf = async (ticker: string): Promise<string> =>
      getDemoHistoryStart((await getDemoEntry(ticker))!);
    expect(await startOf("123450")).toBe("2023-01-01");
    expect(await startOf("005930")).toBe(DEMO_HISTORY_START);
    expect(await startOf("777770")).toBe("2025-01-01");
  });

  it("1시간 안에는 SQL 을 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    const { getDemoUniverse, getDemoEntry } = await import("./universe");
    expect(await getDemoUniverse()).toHaveLength(4);
    await getDemoEntry("005930");
    expect(query).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(59 * 60 * 1000);
    await getDemoUniverse();
    expect(query).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2 * 60 * 1000);
    await getDemoUniverse();
    expect(query).toHaveBeenCalledTimes(6);
  });
});
