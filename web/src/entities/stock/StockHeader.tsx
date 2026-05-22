import type { StockSummary, StockPriceSnapshot } from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { formatVolume, formatMarketCap } from "@/shared/format";
import { WatchlistButton } from "@/features/watchlist/WatchlistButton";
import { StockPanel } from "./StockPanel";
import { PriceCountUp } from "./PriceCountUp";

type StockHeaderProps = {
  ticker: string;
  stock: StockSummary;
};

export const StockHeader = async ({ ticker, stock }: StockHeaderProps) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;

  try {
    prices = await getDailyPrices(ticker, 2);
  } catch {
    hasError = true;
  }

  const latest = prices[0] ?? null;
  const prev = prices[1] ?? null;

  if (hasError || !latest) {
    return (
      <StockPanel noBorder>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{stock.name}</h1>
            <span className="rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">
              {ticker}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {stock.market}
            </span>
          </div>
          <WatchlistButton ticker={ticker} name={stock.name} market={stock.market} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {hasError ? "가격 데이터를 불러오지 못했습니다" : "가격 데이터 없음"}
        </p>
      </StockPanel>
    );
  }

  const change = prev ? latest.close - prev.close : null;
  const changeRate = prev && prev.close !== 0 ? (change! / prev.close) * 100 : null;

  const isRise = change !== null && change > 0;
  const isFall = change !== null && change < 0;

  const changeColor = isRise ? "text-red-500" : isFall ? "text-blue-500" : "text-muted-foreground";

  const changeSign = isRise ? "+" : "";

  return (
    <StockPanel noBorder>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{stock.name}</h1>
          <span className="rounded bg-muted px-2 py-0.5 text-sm font-mono text-muted-foreground">
            {ticker}
          </span>
          <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {stock.market}
          </span>
          {stock.sector && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {stock.sector}
            </span>
          )}
        </div>
        <WatchlistButton ticker={ticker} name={stock.name} market={stock.market} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <span className="text-4xl font-bold tracking-tight">
          <PriceCountUp from={prev?.close ?? latest.close} to={latest.close} />원
        </span>
        {change !== null && changeRate !== null && (
          <span className={`mb-1 text-lg font-medium ${changeColor}`}>
            {changeSign}
            {change.toLocaleString("ko-KR")}원 ({changeSign}
            {changeRate.toFixed(2)}%)
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>거래량 {formatVolume(latest.volume)}</span>
        <span>시가총액 {formatMarketCap(stock.marketCap)}</span>
        <span>기준일 {latest.date}</span>
      </div>
    </StockPanel>
  );
};
