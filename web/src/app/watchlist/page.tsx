"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import { useWatchlistStore } from "@/features/watchlist/store/useWatchlistStore";
import { WatchlistRow } from "@/entities/watchlist/WatchlistRow";
import { StockPanel } from "@/entities/stock/StockPanel";

const WatchlistPage = () => {
  const items = useWatchlistStore((s) => s.items);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);

  const sorted = useMemo(() => [...items].sort((a, b) => b.addedAt - a.addedAt), [items]);
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
      ) : (
        <StockPanel variant="peach">
          <ul>
            {sorted.map((item) => (
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
