"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import {
  useWatchlistStore,
  type WatchlistGroup,
  type WatchlistItem,
} from "@/features/watchlist/store/useWatchlistStore";
import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { WatchlistRow, WatchlistRowSkeleton } from "@/entities/watchlist/WatchlistRow";
import { StockPanel } from "@/entities/stock/StockPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const RECENT_TAB = "recent" as const;

type GroupNameInputProps = {
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  ariaLabel: string;
  className?: string;
};

const GroupNameInput = ({
  initial = "",
  onSubmit,
  onCancel,
  ariaLabel,
  className,
}: GroupNameInputProps) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      aria-label={ariaLabel}
      className={cn("h-8 text-sm", className)}
    />
  );
};

const WatchlistPage = () => {
  const groups = useWatchlistStore((s) => s.groups);
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);
  const createGroup = useWatchlistStore((s) => s.createGroup);
  const renameGroup = useWatchlistStore((s) => s.renameGroup);
  const deleteGroup = useWatchlistStore((s) => s.deleteGroup);
  const moveGroup = useWatchlistStore((s) => s.moveGroup);
  const recentVisited = useRecentVisitedStore((s) => s.items);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);

  const [selectedTab, setSelectedTab] = useState<string>(RECENT_TAB);
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WatchlistGroup | null>(null);

  const isRecentTab = selectedTab === RECENT_TAB;
  const currentGroup = useMemo(
    () => (isRecentTab ? null : (sortedGroups.find((g) => g.id === selectedTab) ?? null)),
    [isRecentTab, sortedGroups, selectedTab]
  );
  const currentIndex = currentGroup ? sortedGroups.findIndex((g) => g.id === currentGroup.id) : -1;
  const canMoveUp = currentIndex > 0;
  const canMoveDown = currentIndex >= 0 && currentIndex < sortedGroups.length - 1;

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

  const handleCreateGroup = (name: string) => {
    createGroup(name);
    const after = useWatchlistStore.getState().groups;
    const latest = [...after].sort((a, b) => b.order - a.order)[0];
    if (latest) setSelectedTab(latest.id);
    setIsCreating(false);
  };

  const handleRenameGroup = (name: string) => {
    if (renamingId) renameGroup(renamingId, name);
    setRenamingId(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    deleteGroup(id);
    if (selectedTab === id) setSelectedTab(RECENT_TAB);
    setDeleteTarget(null);
    toast.success(`'${name}' 그룹을 삭제했어요`);
  };

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
            className={tabButtonClass(selectedTab === t.key, "horizontal")}
          >
            {t.label}
          </button>
        ))}
        {isCreating ? (
          <div className="shrink-0">
            <GroupNameInput
              onSubmit={handleCreateGroup}
              onCancel={() => setIsCreating(false)}
              ariaLabel="새 그룹 이름"
              className="w-36"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="그룹 추가"
          >
            <Plus className="size-4" />
          </button>
        )}
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
            <li className="pt-1">
              {isCreating ? (
                <GroupNameInput
                  onSubmit={handleCreateGroup}
                  onCancel={() => setIsCreating(false)}
                  ariaLabel="새 그룹 이름"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="flex w-full items-center gap-1 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <Plus className="size-4" />
                  그룹 추가
                </button>
              )}
            </li>
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="mb-3 flex h-8 items-center gap-2">
            {isRecentTab ? (
              <h2 className="text-sm font-medium text-foreground">최근 조회</h2>
            ) : currentGroup ? (
              <>
                {renamingId === currentGroup.id ? (
                  <GroupNameInput
                    initial={currentGroup.name}
                    onSubmit={handleRenameGroup}
                    onCancel={() => setRenamingId(null)}
                    ariaLabel="그룹 이름 변경"
                    className="max-w-48"
                  />
                ) : (
                  <h2 className="truncate text-sm font-medium text-foreground">
                    {currentGroup.name}
                  </h2>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveUp}
                    onClick={() => moveGroup(currentGroup.id, "up")}
                    aria-label="그룹 순서 위로"
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveDown}
                    onClick={() => moveGroup(currentGroup.id, "down")}
                    aria-label="그룹 순서 아래로"
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRenamingId(currentGroup.id)}
                    aria-label="그룹 이름 변경"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(currentGroup)}
                    aria-label="그룹 삭제"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </>
            ) : null}
          </header>

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
                        onRemove={isRecentTab ? undefined : () => removeFromWatchlist(item.ticker)}
                      />
                    ))}
              </ul>
            </StockPanel>
          )}
        </section>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              &lsquo;{deleteTarget?.name}&rsquo; 그룹을 삭제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 그룹에만 속한 종목은 관심 종목에서 함께 제거됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default WatchlistPage;
