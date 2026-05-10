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
  let price: StockPriceSnapshot | null = null;
  let financial: FinancialPeriod | null = null;

  try {
    [price, financial] = await Promise.all([getLatestPrice(ticker), getLatestFinancial(ticker)]);
  } catch {
    // DB 오류 시 빈 데이터로 폴백
  }

  const currentPrice = price?.close ?? null;

  const per =
    currentPrice !== null && financial?.eps && financial.eps > 0
      ? currentPrice / financial.eps
      : null;

  const pbr =
    currentPrice !== null && financial?.bps && financial.bps > 0
      ? currentPrice / financial.bps
      : null;

  const hasData = financial !== null || price !== null;

  return (
    <StockPanel variant="sky">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
        핵심 지표
        {financial && <span className="ml-2 font-normal">({financial.year}년 연간 기준)</span>}
      </h2>
      {!hasData ? (
        <p className="text-sm text-muted-foreground">데이터 없음</p>
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
