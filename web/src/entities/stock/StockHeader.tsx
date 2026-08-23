import { ExternalLink } from "lucide-react";
import type { CompanyProfile, StockSummary, StockPriceSnapshot } from "@/shared/types/stock";
import type { MarketActionStatus } from "@/shared/types/quote";
import { getDailyPrices } from "@/lib/prices";
import { getCorpCode } from "@/lib/stocks";
import { getCompanyProfile } from "@/lib/dart";
import { fetchStockMarketAction } from "@/lib/kis-quote-fetch";
import { formatVolume, formatMarketCap } from "@/shared/format";
import { WatchlistButton } from "@/features/watchlist/WatchlistButton";
import { StockPanel } from "./StockPanel";
import { StockHeaderLivePrice } from "./StockHeaderLivePrice";
import { MarketActionBadge } from "./MarketActionBadge";

type StockHeaderProps = {
  ticker: string;
  stock: StockSummary;
};

export const StockHeader = async ({ ticker, stock }: StockHeaderProps) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;
  let profile: CompanyProfile | null = null;
  let marketAction: MarketActionStatus | null = null;

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

  // 실패는 조용히 null — 배지 미표시로 폴백. 헤더 자체 렌더는 막지 않는다.
  try {
    marketAction = await fetchStockMarketAction(ticker);
  } catch {
    marketAction = null;
  }

  const latest = prices[0] ?? null;
  const prev = prices[1] ?? null;

  const initialChange = latest && prev ? latest.close - prev.close : null;
  const initialChangeRate =
    latest && prev && prev.close !== 0 ? ((latest.close - prev.close) / prev.close) * 100 : null;

  if (hasError || !latest) {
    return (
      <StockPanel noBorder>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-headline font-bold">{stock.name}</h1>
            <span className="rounded bg-muted px-2 py-0.5 text-caption text-muted-foreground">
              {ticker}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-caption text-muted-foreground">
              {stock.market}
            </span>
            {profile?.sectorName && (
              <span className="rounded bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                {profile.sectorName}
              </span>
            )}
            {marketAction && <MarketActionBadge status={marketAction} />}
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
        <p className="mt-3 text-body text-muted-foreground">
          {hasError ? "가격 데이터를 불러오지 못했습니다" : "가격 데이터 없음"}
        </p>
      </StockPanel>
    );
  }

  return (
    <StockPanel noBorder>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-headline font-bold">{stock.name}</h1>
          <span className="rounded bg-muted px-2 py-0.5 text-caption font-mono text-muted-foreground">
            {ticker}
          </span>
          <span className="rounded bg-secondary px-2 py-0.5 text-caption text-secondary-foreground">
            {stock.market}
          </span>
          {profile?.sectorName && (
            <span className="rounded bg-muted px-2 py-0.5 text-caption text-muted-foreground">
              {profile.sectorName}
            </span>
          )}
          {marketAction && <MarketActionBadge status={marketAction} />}
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

      <StockHeaderLivePrice
        ticker={ticker}
        initialPrice={latest.close}
        initialChange={initialChange}
        initialChangeRate={initialChangeRate}
      />

      <div className="mt-3 flex flex-wrap gap-4 text-body text-muted-foreground">
        <span>거래량 {formatVolume(latest.volume)}</span>
        <span>시가총액 {formatMarketCap(stock.marketCap)}</span>
        <span>기준일 {latest.date}</span>
      </div>
    </StockPanel>
  );
};
