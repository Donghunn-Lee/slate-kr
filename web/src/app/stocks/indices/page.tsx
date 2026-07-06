import type { Metadata } from "next";
import { INDEX_CODES, INDEX_LABEL, type IndexCode } from "@/shared/constants/indices";
import { IndicesView } from "@/entities/index/IndicesView";
import { getIndexDailyPrices } from "@/lib/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

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

  // 3지수 일봉을 병렬 fetch — 이후 client 전환 시 재요청 없이 즉시 스왑 가능.
  // per-code try/catch: 한 지수 실패가 나머지 렌더를 막지 않게.
  const dailyEntries = await Promise.all(
    INDEX_CODES.map(async (code) => {
      try {
        return [code, await getIndexDailyPrices(code, 1000)] as const;
      } catch {
        return [code, null] as const;
      }
    }),
  );
  const dailyByIndex = Object.fromEntries(dailyEntries) as Record<
    IndexCode,
    IndexDailySnapshot[] | null
  >;

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <IndicesView dailyByIndex={dailyByIndex} initialSelected={selected} />
    </main>
  );
}
