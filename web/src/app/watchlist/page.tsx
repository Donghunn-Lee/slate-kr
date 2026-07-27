"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { Settings2 } from "lucide-react";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import {
  selectTickersByGroup,
  useWatchlistStore,
  type WatchlistItem,
} from "@/features/watchlist/store/useWatchlistStore";
import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { LIVE_TICKER_LIMIT, useMultiQuote } from "@/features/multi-quote/useMultiQuote";
import { WatchlistRow, WatchlistRowSkeleton } from "@/entities/watchlist/WatchlistRow";
import { StockPanel } from "@/entities/stock/StockPanel";
import { Button } from "@/components/ui/button";
import { GroupManagementModal } from "@/features/watchlist/GroupManagementModal";
import { cn } from "@/lib/utils";

const RECENT_TAB = "recent" as const;

const WatchlistPage = () => {
  const groups = useWatchlistStore((s) => s.groups);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);
  const removeMembership = useWatchlistStore((s) => s.removeMembership);
  const recentVisited = useRecentVisitedStore((s) => s.items);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);

  const [selectedTab, setSelectedTab] = useState<string>(RECENT_TAB);
  const [modalOpen, setModalOpen] = useState(false);

  const effectiveTab = useMemo(() => {
    if (selectedTab === RECENT_TAB) return RECENT_TAB;
    return sortedGroups.find((g) => g.id === selectedTab)?.id ?? RECENT_TAB;
  }, [selectedTab, sortedGroups]);

  const isRecentTab = effectiveTab === RECENT_TAB;

  const currentGroup = useMemo(
    () => (isRecentTab ? null : (sortedGroups.find((g) => g.id === effectiveTab) ?? null)),
    [isRecentTab, sortedGroups, effectiveTab]
  );

  const groupMemberships = useWatchlistStore(
    useShallow((s) => (isRecentTab ? [] : selectTickersByGroup(s, effectiveTab)))
  );

  const displayItems = useMemo<WatchlistItem[]>(() => {
    if (isRecentTab) {
      return recentVisited.map((v, idx) => ({
        ticker: v.ticker,
        name: v.name,
        market: v.market,
        addedAt: -idx,
      }));
    }
    return groupMemberships
      .map((m) => {
        const meta = stockMeta[m.ticker];
        if (!meta) return null;
        return { ticker: m.ticker, name: meta.name, market: meta.market, addedAt: m.addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [isRecentTab, recentVisited, groupMemberships, stockMeta]);

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

  const liveTickers = useMemo(
    () => displayItems.slice(0, LIVE_TICKER_LIMIT).map((i) => i.ticker),
    [displayItems]
  );
  const { quotes: liveQuotes, failed: liveFailed } = useMultiQuote(liveTickers);

  const tabs: Array<{ key: string; label: string }> = [
    { key: RECENT_TAB, label: "최근 조회" },
    ...sortedGroups.map((g) => ({ key: g.id, label: g.name })),
  ];

  const tabButtonClass = (selected: boolean, layout: "horizontal" | "vertical") =>
    cn(
      "whitespace-nowrap rounded-md text-sm transition-colors",
      layout === "horizontal" ? "px-3 py-1.5" : "block w-full px-3 py-2 text-left",
      selected
        ? "bg-muted font-medium text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    );

  const emptyMessage = isRecentTab ? "최근 조회한 종목이 없습니다" : "이 그룹에 종목이 없습니다";

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">관심종목</h1>

      <nav aria-label="관심종목 그룹" className="flex items-center gap-1 overflow-x-auto md:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSelectedTab(t.key)}
            className={tabButtonClass(effectiveTab === t.key, "horizontal")}
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
                  className={tabButtonClass(effectiveTab === t.key, "vertical")}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="mb-3 flex h-8 items-center gap-2">
            {isRecentTab ? (
              <h2 className="text-sm font-medium text-foreground">최근 조회</h2>
            ) : currentGroup ? (
              <h2 className="truncate text-sm font-medium text-foreground">{currentGroup.name}</h2>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="ml-auto gap-1.5"
            >
              <Settings2 className="size-4" />
              그룹 관리
            </Button>
          </header>

          {displayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : pricesQuery.isError && countsQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              관심종목 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
          ) : (
            <StockPanel variant="plain" className="py-2">
              <ul>
                {pricesQuery.isLoading
                  ? displayItems.map((item) => <WatchlistRowSkeleton key={item.ticker} />)
                  : displayItems.map((item) => (
                      <WatchlistRow
                        key={item.ticker}
                        item={item}
                        price={pricesMap[item.ticker]}
                        liveQuote={liveQuotes[item.ticker]}
                        isLiveFailed={liveFailed[item.ticker] ?? false}
                        disclosure={countsMap[item.ticker]}
                        onRemove={
                          isRecentTab || !currentGroup
                            ? undefined
                            : () => removeMembership(item.ticker, currentGroup.id)
                        }
                      />
                    ))}
              </ul>
            </StockPanel>
          )}
        </section>
      </div>

      <GroupManagementModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialGroupId={isRecentTab ? null : effectiveTab}
      />
    </main>
  );
};

export default WatchlistPage;
