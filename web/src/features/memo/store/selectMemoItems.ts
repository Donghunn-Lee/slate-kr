import type { MemoEntry } from "@/shared/types/memo";
import type { RecentVisited } from "@/features/search/useRecentVisitedStore";

export const selectMemoItems = (
  memos: Record<string, MemoEntry>
): RecentVisited[] => {
  return Object.entries(memos)
    .sort(([, a], [, b]) => {
      if (a.updatedAt === b.updatedAt) return 0;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    })
    .map(([ticker, entry]) => ({
      ticker,
      name: entry.name,
      market: entry.market,
    }));
};
