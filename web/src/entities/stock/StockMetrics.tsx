import type { StockPriceSnapshot, FinancialPeriod } from "@/shared/types/stock";
import { getLatestPrice } from "@/lib/prices";
import { getLatestFinancial } from "@/lib/financials";
import { formatRatio, formatEps } from "@/shared/format";
import { StockPanel } from "./StockPanel";

type MetricItemProps = {
  label: string;
  value: string;
};

const MetricItem = ({ label, value }: MetricItemProps) => (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
  </div>
);

type StockMetricsProps = {
  ticker: string;
};

export const StockMetrics = async ({ ticker }: StockMetricsProps) => {
  const [priceResult, financialResult] = await Promise.allSettled([
    getLatestPrice(ticker),
    getLatestFinancial(ticker),
  ]);

  const price: StockPriceSnapshot | null =
    priceResult.status === "fulfilled" ? priceResult.value : null;
  const financial: FinancialPeriod | null =
    financialResult.status === "fulfilled" ? financialResult.value : null;

  const hasError =
    priceResult.status === "rejected" && financialResult.status === "rejected";
  const hasData = price !== null || financial !== null;

  const currentPrice = price?.close ?? null;

  const per =
    currentPrice !== null && financial?.eps && financial.eps > 0
      ? currentPrice / financial.eps
      : null;

  const pbr =
    currentPrice !== null && financial?.bps && financial.bps > 0
      ? currentPrice / financial.bps
      : null;

  return (
    <StockPanel variant="peach">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
        핵심 지표
        {financial && <span className="ml-2 font-normal">({financial.year}년 연간 기준)</span>}
      </h2>
      {hasError ? (
        <p className="text-sm text-muted-foreground">지표 데이터를 불러오지 못했습니다</p>
      ) : !hasData ? (
        <p className="text-sm text-muted-foreground">지표 데이터 없음</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <MetricItem label="PER" value={formatRatio(per)} />
          <MetricItem label="PBR" value={formatRatio(pbr)} />
          <MetricItem label="EPS" value={formatEps(financial?.eps ?? null)} />
          <MetricItem label="BPS" value={formatEps(financial?.bps ?? null)} />
        </div>
      )}
    </StockPanel>
  );
};
