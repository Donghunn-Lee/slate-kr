"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import {
  useWatchlistStore,
  type WatchlistItem,
} from "@/features/watchlist/store/useWatchlistStore";
import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { WatchlistRow, WatchlistRowSkeleton } from "@/entities/watchlist/WatchlistRow";
import { StockPanel } from "@/entities/stock/StockPanel";
import { cn } from "@/lib/utils";

const RECENT_TAB = "recent" as const;

const WatchlistPage = () => {
  const groups = useWatchlistStore((s) => s.groups);
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);
  const recentVisited = useRecentVisitedStore((s) => s.items);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order),
    [groups]
  );

  const [selectedTab, setSelectedTab] = useState<string>(RECENT_TAB);

  const isRecentTab = selectedTab === RECENT_TAB;

  const displayItems = useMemo<WatchlistItem[]>(() => {
    if (isRecentTab) {
      return recentVisited.map((v, idx) => ({
        ticker: v.ticker,
        name: v.name,
        market: v.market,
        addedAt: -idx,
      }));
    }
    return memberships
      .filter((m) => m.groupId === selectedTab)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((m) => {
        const meta = stockMeta[m.ticker];
        if (!meta) return null;
        return { ticker: m.ticker, name: meta.name, market: meta.market, addedAt: m.addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [isRecentTab, recentVisited, memberships, stockMeta, selectedTab]);

  const tickersKey = displayItems.map((i) => i.ticker).join(",");

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

  const tabs: Array<{ key: string; label: string }> = [
    { key: RECENT_TAB, label: "최근 조회" },
    ...sortedGroups.map((g) => ({ key: g.id, label: g.name })),
  ];

  const tabButtonClass = (selected: boolean, layout: "horizontal" | "vertical") =>
    cn(
      "whitespace-nowrap rounded-md text-sm transition-colors",
      layout === "horizontal" ? "px-3 py-1.5" : "block w-full px-3 py-2 text-left",
      selected
        ? "bg-peach-bg font-medium text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    );

  const emptyMessage = isRecentTab
    ? "최근 조회한 종목이 없습니다"
    : "이 그룹에 종목이 없습니다";

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">관심종목</h1>

      <nav
        aria-label="관심종목 그룹"
        className="flex gap-1 overflow-x-auto md:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSelectedTab(t.key)}
            className={tabButtonClass(selectedTab === t.key, "horizontal")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex gap-6">
        <aside className="hidden w-44 shrink-0 md:block">
          <ul className="space-y-1" aria-label="관심종목 그룹">
            {tabs.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setSelectedTab(t.key)}
                  className={tabButtonClass(selectedTab === t.key, "vertical")}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          {displayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : pricesQuery.isError && countsQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              관심종목 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
          ) : (
            <StockPanel variant="peach">
              <ul>
                {pricesQuery.isLoading
                  ? displayItems.map((item) => <WatchlistRowSkeleton key={item.ticker} />)
                  : displayItems.map((item) => (
                      <WatchlistRow
                        key={item.ticker}
                        item={item}
                        price={pricesMap[item.ticker]}
                        disclosure={countsMap[item.ticker]}
                        onRemove={
                          isRecentTab ? undefined : () => removeFromWatchlist(item.ticker)
                        }
                      />
                    ))}
              </ul>
            </StockPanel>
          )}
        </section>
      </div>
    </main>
  );
};

export default WatchlistPage;
