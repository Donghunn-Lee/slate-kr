import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockHeader } from "@/entities/stock/StockHeader";
import { StockMetrics } from "@/entities/stock/StockMetrics";
import { HeaderSkeleton, MetricsSkeleton } from "@/entities/stock/Skeletons";
import { RecentVisitedRecorder } from "@/features/search/RecentVisitedRecorder";
import { StockTabPanel } from "@/entities/stock/StockTabPanel";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
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
  // openGraph·twitter 는 세그먼트 단위로 통째 교체되므로 루트의 type·card 를 다시 적는다.
  const shareTitle = `${stock.name}(${ticker}) | SlateKR`;
  return {
    description: `${stock.name}(${ticker}) 주가, 재무정보, 공시를 확인하세요`,
    openGraph: { title: shareTitle, type: "website" },
    twitter: { card: "summary", title: shareTitle },
  };
}

export default async function StockDetailLayout({ children, params }: LayoutProps) {
  const { ticker } = await params;
  // 조회 실패(throw)는 잡지 않고 error 경계로 보낸다 — 404 는 종목 없음(null)에만 쓴다.
  const stock = await getStockByTicker(ticker);
  if (!stock) notFound();

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <RecentVisitedRecorder ticker={ticker} name={stock.name} market={stock.market} />
      <Suspense fallback={<HeaderSkeleton />}>
        <StockHeader ticker={ticker} stock={stock} />
      </Suspense>
      <Suspense fallback={<MetricsSkeleton />}>
        <StockMetrics ticker={ticker} />
      </Suspense>
      <StockTabPanel ticker={ticker}>{children}</StockTabPanel>
    </main>
  );
}
