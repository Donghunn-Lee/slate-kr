import { ExternalLink } from "lucide-react";
import type {
  CompanyProfile,
  StockSummary,
  StockPriceSnapshot,
} from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { getCorpCode } from "@/lib/stocks";
import { getCompanyProfile } from "@/lib/dart";
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
  let profile: CompanyProfile | null = null;

  try {
    prices = await getDailyPrices(ticker, 2);
  } catch {
    hasError = true;
  }

  try {
    const corpCode = await getCorpCode(ticker);
    if (corpCode) profile = await getCompanyProfile(corpCode);
  } catch {
    profile = null;
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
            {profile?.sectorName && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {profile.sectorName}
              </span>
            )}
            {profile?.homepageUrl && (
              <a
                href={profile.homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="홈페이지 새 창에서 열기"
                className="inline-flex items-center text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
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

  const changeColor = isRise ? "text-price-up" : isFall ? "text-price-down" : "text-muted-foreground";

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
          {profile?.sectorName && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {profile.sectorName}
            </span>
          )}
          {profile?.homepageUrl && (
            <a
              href={profile.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="홈페이지 새 창에서 열기"
              className="inline-flex items-center text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
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
