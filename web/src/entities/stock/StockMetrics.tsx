import type { StockPriceSnapshot, FinancialPeriod } from "@/shared/types/stock";
import { getLatestPrice } from "@/lib/prices";
import { getFinancials, computeTtmEps } from "@/lib/financials";
import { getListedAt } from "@/lib/stocks";
import { formatRatio, formatEps } from "@/shared/format";
import { StockPanel } from "./StockPanel";
import { StockMetricsFormulaTooltip } from "./StockMetricsFormulaTooltip";

type MetricItemProps = {
  label: string;
  value: string;
};

const MetricItem = ({ label, value }: MetricItemProps) => (
  <div className="space-y-1">
    <p className="text-caption font-medium text-muted-foreground">{label}</p>
    <p className="text-value font-semibold">{value}</p>
  </div>
);

type StockMetricsProps = {
  ticker: string;
};

export const StockMetrics = async ({ ticker }: StockMetricsProps) => {
  const [priceResult, financialsResult, listedAtResult] = await Promise.allSettled([
    getLatestPrice(ticker),
    getFinancials(ticker),
    getListedAt(ticker),
  ]);

  const price: StockPriceSnapshot | null =
    priceResult.status === "fulfilled" ? priceResult.value : null;
  const financials = financialsResult.status === "fulfilled" ? financialsResult.value : null;
  const listedAt: Date | null =
    listedAtResult.status === "fulfilled" ? listedAtResult.value : null;
  const latestAnnual: FinancialPeriod | null = financials?.annual[0] ?? null;
  const ttm = computeTtmEps(financials?.quarterly ?? [], latestAnnual, listedAt);

  const hasError =
    priceResult.status === "rejected" && financialsResult.status === "rejected";
  const hasData = price !== null || latestAnnual !== null;

  const currentPrice = price?.close ?? null;
  const displayEps = ttm.value;
  const displayBps = latestAnnual?.bps ?? null;

  const per =
    currentPrice !== null && displayEps !== null && displayEps > 0
      ? currentPrice / displayEps
      : null;

  const pbr =
    currentPrice !== null && displayBps !== null && displayBps > 0
      ? currentPrice / displayBps
      : null;

  const sourceLabel = (() => {
    if (ttm.source === "ttm") return "최근 4분기 기준";
    if (ttm.source === "annualized") return "연환산 기준";
    if (ttm.source === "annual_fallback" && latestAnnual !== null)
      return `${latestAnnual.year}년 연간 기준`;
    return null;
  })();

  return (
    <StockPanel variant="peach">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body font-semibold text-muted-foreground">
          핵심 지표
          {sourceLabel && <span className="ml-2 font-normal">({sourceLabel})</span>}
        </h2>
        <StockMetricsFormulaTooltip source={ttm.source} />
      </div>
      {hasError ? (
        <p className="text-body text-muted-foreground">지표 데이터를 불러오지 못했습니다</p>
      ) : !hasData ? (
        <p className="text-body text-muted-foreground">지표 데이터 없음</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          <MetricItem label="PER" value={formatRatio(per)} />
          <MetricItem label="PBR" value={formatRatio(pbr)} />
          <MetricItem label="EPS" value={formatEps(displayEps)} />
          <MetricItem label="BPS" value={formatEps(displayBps)} />
        </div>
      )}
    </StockPanel>
  );
};
