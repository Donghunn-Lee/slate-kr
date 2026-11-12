import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata, ResolvingMetadata } from "next";
import { getMarketCalendar } from "@/lib/market-calendar";
import { getStockByTicker } from "@/lib/stocks";
import { StockHeader } from "@/entities/stock/StockHeader";
import { StockMetrics } from "@/entities/stock/StockMetrics";
import { HeaderSkeleton, MetricsSkeleton } from "@/entities/stock/Skeletons";
import { isRegularCloseWindow } from "@/entities/stock/stockHeaderLabel";
import { RecentVisitedRecorder } from "@/features/search/RecentVisitedRecorder";
import { StockTabPanel } from "@/entities/stock/StockTabPanel";
import { getKrxSessionState, isKrxOpeningWindow } from "@/shared/utils/market";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata(
  { params }: { params: Promise<{ ticker: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { ticker } = await params;
  let stock = null;
  try {
    stock = await getStockByTicker(ticker);
  } catch {
    return {};
  }
  if (!stock) return {};
  // title 은 두지 않는다 — layout 의 title 은 하위 세그먼트(chart·financials·disclosures)에서
  // 루트 title.template 을 대체해 접미사가 빠진다. 탭별 title 은 각 page 몫.
  // openGraph·twitter 는 세그먼트 단위로 통째 교체되므로 루트의 type·url·card 를 다시 적고,
  // 루트의 파일 컨벤션 og 이미지는 부모 결과에서 이어받는다.
  const shareTitle = `${stock.name}(${ticker}) | SlateKR`;
  const { openGraph: parentOpenGraph } = await parent;
  return {
    description: `${stock.name}(${ticker}) 주가, 재무정보, 공시를 확인하세요`,
    openGraph: {
      title: shareTitle,
      type: "website",
      url: "./",
      images: parentOpenGraph?.images,
    },
    twitter: { card: "summary_large_image", title: shareTitle },
  };
}

export default async function StockDetailLayout({ children, params }: LayoutProps) {
  const { ticker } = await params;
  // 조회 실패(throw)는 잡지 않고 error 경계로 보낸다 — 404 는 종목 없음(null)에만 쓴다.
  const stock = await getStockByTicker(ticker);
  if (!stock) notFound();

  // fallback 도 요청 시각에 서버에서 그려진다 — 헤더가 정규장 종가 줄을 그리는 시간대인지를 같은 판정으로 정해
  // 스켈레톤 높이를 맞춘다.
  const calendar = await getMarketCalendar();
  const now = new Date();
  const session = getKrxSessionState(now, calendar);
  const showRegularClose = isRegularCloseWindow(
    session,
    isKrxOpeningWindow(session, now, calendar)
  );

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <RecentVisitedRecorder ticker={ticker} name={stock.name} market={stock.market} />
      <Suspense fallback={<HeaderSkeleton showRegularClose={showRegularClose} />}>
        <StockHeader ticker={ticker} stock={stock} />
      </Suspense>
      <Suspense fallback={<MetricsSkeleton />}>
        <StockMetrics ticker={ticker} />
      </Suspense>
      <StockTabPanel ticker={ticker}>{children}</StockTabPanel>
    </main>
  );
}
