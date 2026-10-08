import type { StockPriceSnapshot, FinancialPeriod } from "@/shared/types/stock";
import { getLatestPrice } from "@/lib/prices";
import {
  calcLatestDividendYield,
  calcPer,
  getFinancials,
  computeTtmEps,
} from "@/lib/financials";
import { getListedAt } from "@/lib/stocks";
import { formatRatio, formatEps, formatPercent } from "@/shared/format";
import { isNonKrwTicker } from "@/shared/constants/nonKrwTickers";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { NonKrwNotice } from "./NonKrwNotice";
import { StockPanel } from "./StockPanel";
import { StockMetricsFormulaTooltip } from "./StockMetricsFormulaTooltip";

type MetricItemProps = {
  label: string;
  value: string;
  // 기대는 조회가 실패해 비었다 — 기준 불일치·적자 등 의도된 숨김의 "—" 와 구분한다.
  isFailed?: boolean;
};

const MetricItem = ({ label, value, isFailed = false }: MetricItemProps) => (
  <div className="space-y-1">
    <p className="text-caption font-medium text-muted-foreground">{label}</p>
    <p className="text-value font-semibold">
      {value}
      {isFailed && <StatusBadge label="일시 지연" className="ml-1.5 align-middle" />}
    </p>
  </div>
);

const logRejected = (ticker: string, lookup: string, result: PromiseSettledResult<unknown>) => {
  if (result.status === "fulfilled") return;
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.error(`[stock-metrics] ${lookup} load failed for ${ticker}: ${message}`);
};

type StockMetricsProps = {
  ticker: string;
};

export const StockMetrics = async ({ ticker }: StockMetricsProps) => {
  if (isNonKrwTicker(ticker)) {
    return (
      <StockPanel variant="peach">
        <NonKrwNotice ticker={ticker} />
      </StockPanel>
    );
  }

  const [priceResult, financialsResult, listedAtResult] = await Promise.allSettled([
    getLatestPrice(ticker),
    getFinancials(ticker),
    getListedAt(ticker),
  ]);
  // 상장일 실패는 연환산 EPS 대신 연간 EPS 로 내려갈 뿐이라 표시 없이 로그만 남긴다.
  logRejected(ticker, "price", priceResult);
  logRejected(ticker, "financials", financialsResult);
  logRejected(ticker, "listedAt", listedAtResult);

  const price: StockPriceSnapshot | null =
    priceResult.status === "fulfilled" ? priceResult.value : null;
  const financials = financialsResult.status === "fulfilled" ? financialsResult.value : null;
  const listedAt: Date | null =
    listedAtResult.status === "fulfilled" ? listedAtResult.value : null;
  const latestAnnual: FinancialPeriod | null = financials?.annual[0] ?? null;
  const ttm = computeTtmEps(financials?.quarterly ?? [], latestAnnual, listedAt);

  // 지표 6개가 모두 재무에 기댄다(EPS·BPS·DPS 는 직접, PER·PBR·시가배당률은 그 값을 거쳐) —
  // 재무가 실패하면 가격이 있어도 보여 줄 지표가 없다.
  const hasError = financialsResult.status === "rejected";
  const isPriceFailed = priceResult.status === "rejected";
  const hasData = price !== null || latestAnnual !== null;

  const currentPrice = price?.close ?? null;
  const displayEps = ttm.value;
  const displayBps = latestAnnual?.bps ?? null;
  const displayDps = latestAnnual?.dps ?? null;

  const per = calcPer(currentPrice, displayEps);

  const pbr =
    currentPrice !== null && displayBps !== null && displayBps > 0
      ? currentPrice / displayBps
      : null;

  const dividendYield = calcLatestDividendYield(currentPrice, latestAnnual);

  const sourceLabel = (() => {
    const period = (() => {
      if (ttm.source === "ttm") return "최근 4분기";
      if (ttm.source === "annualized") return "연환산";
      if (ttm.source === "annual_fallback" && latestAnnual !== null)
        return `${latestAnnual.year}년 연간`;
      return null;
    })();
    // EPS·BPS 모두 재무제표 축(연결 기준)을 따르므로 기간 라벨 뒤에 붙인다
    if (period !== null) return `${period} · 연결 기준`;
    return latestAnnual !== null ? "연결 기준" : null;
  })();

  return (
    <StockPanel variant="peach">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body font-semibold text-muted-foreground">
          핵심 지표
          {sourceLabel && <span className="ml-2 font-normal">({sourceLabel})</span>}
        </h2>
        <StockMetricsFormulaTooltip
          source={ttm.source}
          bpsYear={displayBps !== null ? latestAnnual?.year ?? null : null}
        />
      </div>
      {hasError ? (
        <p className="text-body text-muted-foreground">지표 데이터를 불러오지 못했습니다</p>
      ) : !hasData ? (
        <p className="text-body text-muted-foreground">지표 데이터 없음</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <MetricItem label="PER" value={formatRatio(per)} isFailed={isPriceFailed} />
          <MetricItem label="PBR" value={formatRatio(pbr)} isFailed={isPriceFailed} />
          <MetricItem label="EPS" value={formatEps(displayEps)} />
          <MetricItem label="BPS" value={formatEps(displayBps, true, 0)} />
          <MetricItem label="DPS" value={formatEps(displayDps)} />
          <MetricItem
            label="시가배당률"
            value={formatPercent(dividendYield)}
            isFailed={isPriceFailed}
          />
        </div>
      )}
    </StockPanel>
  );
};
