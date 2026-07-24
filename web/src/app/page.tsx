import { RecentVisited } from "@/entities/home/RecentVisited";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { IndexSlate } from "@/features/index-quotes/IndexSlate";
import { MarketRankingSlate } from "@/features/market-ranking/MarketRankingSlate";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";
import { OverseasIndexRow } from "@/entities/index/OverseasIndexRow";
import {
  OVERSEAS_INDEX_CODES,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import { getIndexDailyPrices } from "@/lib/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

// 지수 상세 페이지와 동일 정책. 해외 EOD는 하루 한 번 갱신.
export const revalidate = 3600;

const fetchOverseasSnapshots = async (): Promise<
  Record<OverseasIndexCode, IndexDailySnapshot | null>
> => {
  const entries = await Promise.all(
    OVERSEAS_INDEX_CODES.map(async (code) => {
      try {
        const daily = await getIndexDailyPrices(code, 1);
        return [code, daily.length > 0 ? daily[daily.length - 1] : null] as const;
      } catch {
        return [code, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<
    OverseasIndexCode,
    IndexDailySnapshot | null
  >;
};

async function HomePage() {
  const overseasByCode = await fetchOverseasSnapshots();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 pb-12">
      <IndexSlate
        overseasSlot={<OverseasIndexRow snapshotsByCode={overseasByCode} />}
      />
      <RecentVisited />
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <MarketRankingSlate />
        <WatchlistPreview />
      </div>
      <ServiceValue />
    </main>
  );
}

export default HomePage;
