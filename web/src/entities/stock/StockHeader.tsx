import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import type { CompanyProfile, StockSummary, StockPriceSnapshot } from "@/shared/types/stock";
import type { MarketActionStatus } from "@/shared/types/quote";
import { getDailyPrices, getLatestKstDate } from "@/lib/prices";
import { getCorpCode } from "@/lib/stocks";
import { getCompanyProfile } from "@/lib/dart";
import { fetchStockMarketAction } from "@/lib/kis-quote-fetch";
import { fetchNxEligible } from "@/lib/quote-snapshots";
import { formatVolume, formatMarketCap } from "@/shared/format";
import { WatchlistButton } from "@/features/watchlist/WatchlistButton";
import { MemoButton } from "@/features/memo/MemoButton";
import { StockPanel } from "./StockPanel";
import { StockHeaderBaseDate } from "./StockHeaderBaseDate";
import { StockHeaderLivePrice } from "./StockHeaderLivePrice";
import { MarketActionBadge } from "./MarketActionBadge";

type StockHeaderProps = {
  ticker: string;
  stock: StockSummary;
};

type MarketActionSlotProps = {
  status: Promise<MarketActionStatus | null>;
};

// 시장조치 배지는 KIS 단발 조회라 헤더와 따로 스트리밍한다 — 헤더 표시가 KIS 응답을 기다리지 않는다.
const MarketActionSlot = async ({ status }: MarketActionSlotProps) => {
  const resolved = await status;
  return resolved ? <MarketActionBadge status={resolved} /> : null;
};

export const StockHeader = async ({ ticker, stock }: StockHeaderProps) => {
  // 헤더 진입 시 바로 시작해 promise 로 넘긴다 — 슬롯 안에서 시작하면 아래 DB·DART 대기 뒤로 밀린다.
  // 실패는 조용히 null — 배지 미표시로 폴백. 헤더 자체 렌더는 막지 않는다.
  const marketAction = fetchStockMarketAction(ticker).catch(() => null);

  // 조회별 실패를 격리한다 — 실패한 요소만 빠진다(Promise.all 이면 하나의 실패가 전체를 reject).
  const [pricesResult, profileResult, nxResult, kstDateResult] = await Promise.allSettled([
    getDailyPrices(ticker, 2),
    (async () => {
      const corpCode = await getCorpCode(ticker);
      return corpCode ? getCompanyProfile(corpCode) : null;
    })(),
    fetchNxEligible(ticker),
    getLatestKstDate(ticker),
  ]);

  const hasError = pricesResult.status === "rejected";
  const prices: StockPriceSnapshot[] =
    pricesResult.status === "fulfilled" ? pricesResult.value : [];
  const profile: CompanyProfile | null =
    profileResult.status === "fulfilled" ? profileResult.value : null;
  // null 은 "판정 불가" — 토글 미노출로 폴백된다. 예외도 동일 처리.
  const nxEligible: boolean | null = nxResult.status === "fulfilled" ? nxResult.value : null;
  // SELECT to_char 로 문자열 수신하는 최신 거래일. 환경 TZ 와 무관하게 저장 일자 그대로.
  const initialKstDate: string | null =
    kstDateResult.status === "fulfilled" ? kstDateResult.value : null;

  const latest = prices[0] ?? null;
  const prev = prices[1] ?? null;

  // 등락 기준은 기준가(basePrice). 없는 행은 직전 거래일 종가로 폴백.
  const basis = latest ? (latest.basePrice ?? prev?.close ?? null) : null;
  const initialChange = latest && basis !== null ? latest.close - basis : null;
  const initialChangeRate =
    latest && basis !== null && basis !== 0 ? ((latest.close - basis) / basis) * 100 : null;

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
            <Suspense fallback={null}>
              <MarketActionSlot status={marketAction} />
            </Suspense>
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
          <div className="flex items-center gap-2">
            <MemoButton ticker={ticker} name={stock.name} market={stock.market} />
            <WatchlistButton ticker={ticker} name={stock.name} market={stock.market} />
          </div>
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
          <Suspense fallback={null}>
            <MarketActionSlot status={marketAction} />
          </Suspense>
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
        <div className="flex items-center gap-2">
          <MemoButton ticker={ticker} name={stock.name} market={stock.market} />
          <WatchlistButton ticker={ticker} name={stock.name} market={stock.market} />
        </div>
      </div>

      <StockHeaderLivePrice
        ticker={ticker}
        initialPrice={latest.close}
        initialChange={initialChange}
        initialChangeRate={initialChangeRate}
        initialDate={initialKstDate}
        nxEligible={nxEligible}
      />

      <div className="mt-3 flex flex-wrap gap-4 text-body text-muted-foreground">
        <span>거래량 {formatVolume(latest.volume)}</span>
        <span>시가총액 {formatMarketCap(stock.marketCap)}</span>
        <StockHeaderBaseDate latestDate={latest.date} />
      </div>
    </StockPanel>
  );
};
