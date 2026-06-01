import { Suspense } from "react";
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
