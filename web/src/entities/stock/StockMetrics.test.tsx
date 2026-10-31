// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@/test/domSetup";
import { getFinancials } from "@/lib/financials";
import { getLatestPrice } from "@/lib/prices";
import { getListedAt, getNonKrwCurrency } from "@/lib/stocks";
import type { FinancialPeriod, StockPriceSnapshot } from "@/shared/types/stock";
import { StockMetrics } from "./StockMetrics";

vi.mock("@/lib/prices", () => ({ getLatestPrice: vi.fn() }));
// PER·PBR·시가배당률 계산은 실물로 두고 조회만 교체한다.
vi.mock("@/lib/financials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/financials")>()),
  getFinancials: vi.fn(),
}));
vi.mock("@/lib/stocks", () => ({ getListedAt: vi.fn(), getNonKrwCurrency: vi.fn() }));

// jsdom 은 matchMedia 를 구현하지 않는다 — 산식 Tooltip 의 터치 판정(useIsTouch)이 렌더 중 호출한다.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;

const PRICE: StockPriceSnapshot = {
  ticker: "005930",
  date: "2026-10-27",
  open: 60000,
  high: 60000,
  low: 60000,
  close: 60000,
  volume: 1,
  marketCap: null,
  basePrice: null,
};

// 분기 없이 연간 1행 — EPS 가 연간 폴백으로 정해져 값이 픽스처에서 바로 읽힌다.
const ANNUAL: FinancialPeriod = {
  ticker: "005930",
  year: 2025,
  quarter: null,
  reportType: "annual",
  revenue: null,
  operatingProfit: null,
  netIncome: null,
  totalAssets: null,
  totalEquity: null,
  eps: 5000,
  bps: 50000,
  per: null,
  pbr: null,
  operatingMargin: null,
  netMargin: null,
  debtRatio: null,
  roe: null,
  roa: null,
  dps: 1000,
  payoutRatio: null,
  dividendYield: null,
  revenueGrowth: null,
  operatingProfitGrowth: null,
  netIncomeGrowth: null,
  shareBasisMismatch: false,
};

// async Server Component — 반환 트리를 받아 렌더한다(하위는 모두 동기 컴포넌트).
const renderMetrics = async () => render(await StockMetrics({ ticker: "005930" }));

const metricItem = (label: string) => within(screen.getByText(label).parentElement!);

describe("StockMetrics 부분 실패", () => {
  beforeEach(() => {
    vi.mocked(getLatestPrice).mockResolvedValue(PRICE);
    vi.mocked(getFinancials).mockResolvedValue({ annual: [ANNUAL], quarterly: [] });
    vi.mocked(getListedAt).mockResolvedValue(null);
    vi.mocked(getNonKrwCurrency).mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("가격 조회 실패 → PER · PBR · 시가배당률에만 배지, EPS · BPS · DPS 값 유지", async () => {
    vi.mocked(getLatestPrice).mockRejectedValue(new Error("db timeout"));
    await renderMetrics();

    for (const label of ["PER", "PBR", "시가배당률"]) {
      expect(metricItem(label).getByText("로딩 실패")).toBeInTheDocument();
    }
    expect(screen.getAllByText("로딩 실패")).toHaveLength(3);
    expect(metricItem("EPS").getByText("5,000원")).toBeInTheDocument();
    expect(metricItem("BPS").getByText("50,000원")).toBeInTheDocument();
    expect(metricItem("DPS").getByText("1,000원")).toBeInTheDocument();
  });

  it("전부 성공 → 배지 없이 가격 기반 지표까지 표시", async () => {
    await renderMetrics();

    expect(screen.queryByText("로딩 실패")).not.toBeInTheDocument();
    expect(metricItem("PER").getByText("12.00배")).toBeInTheDocument();
    expect(metricItem("PBR").getByText("1.20배")).toBeInTheDocument();
    expect(metricItem("시가배당률").getByText("1.67%")).toBeInTheDocument();
  });

  // 지표 6개가 모두 재무에 기대므로 이쪽은 부분 실패가 아니라 섹션 에러다.
  it("재무 조회 실패 → 섹션 에러 문구, 지표 · 배지 없음", async () => {
    vi.mocked(getFinancials).mockRejectedValue(new Error("db timeout"));
    await renderMetrics();

    expect(screen.getByText("지표 데이터를 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.queryByText("PER")).not.toBeInTheDocument();
    expect(screen.queryByText("로딩 실패")).not.toBeInTheDocument();
  });
});
