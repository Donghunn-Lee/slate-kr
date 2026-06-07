"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import {
  useWatchlistStore,
  type WatchlistItem,
} from "@/features/watchlist/store/useWatchlistStore";
import { WatchlistRow, WatchlistRowSkeleton } from "@/entities/watchlist/WatchlistRow";
import { StockPanel } from "@/entities/stock/StockPanel";

const WatchlistPage = () => {
  const groups = useWatchlistStore((s) => s.groups);
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);

  const sorted = useMemo<WatchlistItem[]>(() => {
    const defaultGroup = [...groups].sort((a, b) => a.order - b.order)[0];
    if (!defaultGroup) return [];
    return memberships
      .filter((m) => m.groupId === defaultGroup.id)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((m) => {
        const meta = stockMeta[m.ticker];
        if (!meta) return null;
        return { ticker: m.ticker, name: meta.name, market: meta.market, addedAt: m.addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [groups, memberships, stockMeta]);
  const tickersKey = sorted.map((i) => i.ticker).join(",");

  const [pricesQuery, countsQuery] = useQueries({
    queries: [
      {
        queryKey: ["watchlist-prices", tickersKey],
        queryFn: async (): Promise<TickerPriceSummary[]> => {
          const r = await fetch(`/api/prices?tickers=${tickersKey}`);
          if (!r.ok) throw new Error("prices fetch failed");
          return r.json();
        },
        enabled: tickersKey.length > 0,
      },
      {
        queryKey: ["watchlist-disclosures-recent-count", tickersKey],
        queryFn: async (): Promise<TickerDisclosureCount[]> => {
          const r = await fetch(`/api/disclosures/recent-count?tickers=${tickersKey}`);
          if (!r.ok) throw new Error("disclosure count fetch failed");
          return r.json();
        },
        enabled: tickersKey.length > 0,
      },
    ],
  });

  const pricesMap = useMemo(
    () => Object.fromEntries((pricesQuery.data ?? []).map((p) => [p.ticker, p])),
    [pricesQuery.data]
  );
  const countsMap = useMemo(
    () => Object.fromEntries((countsQuery.data ?? []).map((d) => [d.ticker, d])),
    [countsQuery.data]
  );

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">관심종목</h1>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">관심종목이 없습니다</p>
      ) : pricesQuery.isError && countsQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          관심종목 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </p>
      ) : (
        <StockPanel variant="peach">
          <ul>
            {pricesQuery.isLoading
              ? sorted.map((item) => <WatchlistRowSkeleton key={item.ticker} />)
              : sorted.map((item) => (
                  <WatchlistRow
                    key={item.ticker}
                    item={item}
                    price={pricesMap[item.ticker]}
                    disclosure={countsMap[item.ticker]}
                    onRemove={() => removeFromWatchlist(item.ticker)}
                  />
                ))}
          </ul>
        </StockPanel>
      )}
    </main>
  );
};

export default WatchlistPage;
