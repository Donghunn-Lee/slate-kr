import { Suspense } from "react";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockDisclosures } from "@/entities/stock/StockDisclosures";
import { DisclosuresSkeleton } from "@/entities/stock/Skeletons";
import { isPeriodPreset, type PeriodPreset } from "@/features/disclosure/types";

export const revalidate = 3600;

type SearchParams = {
  preset?: string;
  bgn?: string;
  end?: string;
  q?: string;
  page?: string;
};

type PageProps = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<SearchParams>;
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { ticker } = await params;
  const stock = await getStockByTicker(ticker);
  if (!stock) return { title: "종목을 찾을 수 없습니다 | SlateKR" };
  return {
    title: `${stock.name}(${ticker}) 공시 | SlateKR`,
    description: `${stock.name}의 DART 공시 내역을 기간·검색어 필터로 조회하고 AI 요약을 확인하세요.`,
  };
};

export default async function DisclosuresPage({ params, searchParams }: PageProps) {
  const { ticker } = await params;
  const sp = await searchParams;

  const preset: PeriodPreset = isPeriodPreset(sp.preset) ? sp.preset : "1Y";
  const query = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const bgn = sp.bgn;
  const end = sp.end;

  return (
    <Suspense fallback={<DisclosuresSkeleton />}>
      <StockDisclosures
        ticker={ticker}
        preset={preset}
        bgnDate={bgn}
        endDate={end}
        query={query}
        page={page}
      />
    </Suspense>
  );
}
