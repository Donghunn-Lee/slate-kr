import type { Metadata } from "next";
import {
  DOMESTIC_INDEX_CODES,
  INDEX_LABEL,
  type DomesticIndexCode,
} from "@/shared/constants/indices";
import { IndicesView } from "@/entities/index/IndicesView";
import { getIndexDailyPrices } from "@/lib/indices";
import { getPriceStats } from "@/lib/prices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";

export const revalidate = 3600;

type PageProps = {
  searchParams: Promise<{ index?: string }>;
};

const resolveIndex = (raw: string | undefined): DomesticIndexCode =>
  (DOMESTIC_INDEX_CODES as readonly string[]).includes(raw ?? "")
    ? (raw as DomesticIndexCode)
    : "KOSPI";

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
    DOMESTIC_INDEX_CODES.map(async (code) => {
      try {
        return [code, await getIndexDailyPrices(code, 1000)] as const;
      } catch {
        return [code, null] as const;
      }
    }),
  );
  const dailyByIndex = Object.fromEntries(dailyEntries) as Record<
    DomesticIndexCode,
    IndexDailySnapshot[] | null
  >;

  // stats · 최신 volume 은 이미 fetch 된 dailyByIndex 를 재사용해 SSR 에서 산출.
  // getPriceStats 는 date/high/low/close 만 요구하므로 IndexDailySnapshot 구조적 투입.
  // 최신 EOD volume 은 ASC 배열의 마지막 원소. 결측(월봉 재샘플 등)엔 null.
  const statsByIndex = Object.fromEntries(
    DOMESTIC_INDEX_CODES.map((code) => {
      const daily = dailyByIndex[code];
      return [code, daily && daily.length > 0 ? getPriceStats(daily) : null];
    }),
  ) as Record<DomesticIndexCode, PriceStats | null>;

  const volumeByIndex = Object.fromEntries(
    DOMESTIC_INDEX_CODES.map((code) => {
      const daily = dailyByIndex[code];
      const last = daily && daily.length > 0 ? daily[daily.length - 1] : null;
      return [code, last?.volume ?? null];
    }),
  ) as Record<DomesticIndexCode, number | null>;

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <IndicesView
        dailyByIndex={dailyByIndex}
        statsByIndex={statsByIndex}
        volumeByIndex={volumeByIndex}
        initialSelected={selected}
      />
    </main>
  );
}
