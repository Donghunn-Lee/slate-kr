import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { INDEX_CODES, INDEX_LABEL, type IndexCode } from "@/shared/constants/indices";
import { IndexChartSection } from "@/entities/index/IndexChartSection";
import { ChartSkeleton } from "@/entities/stock/Skeletons";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

type PageProps = {
  searchParams: Promise<{ index?: string }>;
};

const resolveIndex = (raw: string | undefined): IndexCode =>
  (INDEX_CODES as readonly string[]).includes(raw ?? "") ? (raw as IndexCode) : "KOSPI";

export const generateMetadata = async ({ searchParams }: PageProps): Promise<Metadata> => {
  const { index } = await searchParams;
  const selected = resolveIndex(index);
  const label = INDEX_LABEL[selected];
  return {
    title: `${label} 지수 · SlateKR`,
    description: `${label} 지수의 당일/일봉/월봉 차트를 확인하세요.`,
  };
};

export default async function IndicesPage({ searchParams }: PageProps) {
  const { index } = await searchParams;
  const selected = resolveIndex(index);

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">지수</h1>
        <div className="flex gap-1" role="tablist" aria-label="지수 선택">
          {INDEX_CODES.map((code) => {
            const active = code === selected;
            return (
              <Link
                key={code}
                href={`/stocks/indices?index=${code}`}
                role="tab"
                aria-selected={active}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {INDEX_LABEL[code]}
              </Link>
            );
          })}
        </div>
      </div>
      <Suspense key={selected} fallback={<ChartSkeleton />}>
        <IndexChartSection indexCode={selected} />
      </Suspense>
    </main>
  );
}
