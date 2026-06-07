import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WatchlistGroup = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
};

export type Membership = {
  groupId: string;
  ticker: string;
  addedAt: number;
};

export type StockMeta = {
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export type WatchlistItem = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  addedAt: number;
};

const MAX_WATCHLIST_SIZE = 50;
const DEFAULT_GROUP_NAME = "내 관심 종목";

type WatchlistState = {
  groups: WatchlistGroup[];
  memberships: Membership[];
  stockMeta: Record<string, StockMeta>;

  addToWatchlist: (
    item: { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" },
    groupId?: string
  ) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;
};

const createDefaultGroup = (): WatchlistGroup => ({
  id: crypto.randomUUID(),
  name: DEFAULT_GROUP_NAME,
  order: 0,
  createdAt: Date.now(),
});

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      groups: [createDefaultGroup()],
      memberships: [],
      stockMeta: {},

      addToWatchlist: (item, groupId) => {
        const { groups, memberships, stockMeta } = get();
        if (groups.length === 0) return;

        const targetGroupId =
          groupId ?? [...groups].sort((a, b) => a.order - b.order)[0].id;

        if (
          memberships.some(
            (m) => m.groupId === targetGroupId && m.ticker === item.ticker
          )
        ) {
          return;
        }

        const isNewTicker = !memberships.some((m) => m.ticker === item.ticker);
        if (isNewTicker) {
          const distinctCount = new Set(memberships.map((m) => m.ticker)).size;
          if (distinctCount >= MAX_WATCHLIST_SIZE) return;
        }

        set({
          memberships: [
            ...memberships,
            { groupId: targetGroupId, ticker: item.ticker, addedAt: Date.now() },
          ],
          stockMeta: {
            ...stockMeta,
            [item.ticker]: { name: item.name, market: item.market },
          },
        });
      },

      removeFromWatchlist: (ticker) => {
        const { memberships, stockMeta } = get();
        const nextMemberships = memberships.filter((m) => m.ticker !== ticker);
        const nextStockMeta = { ...stockMeta };
        delete nextStockMeta[ticker];
        set({ memberships: nextMemberships, stockMeta: nextStockMeta });
      },

      isInWatchlist: (ticker) => {
        return get().memberships.some((m) => m.ticker === ticker);
      },
    }),
    {
      name: "slatekr-watchlist",
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0) {
          const old = persistedState as {
            items?: Array<{
              ticker: string;
              name: string;
              market: "KOSPI" | "KOSDAQ";
              addedAt: number;
            }>;
          };
          const items = old?.items ?? [];
          const defaultGroup = createDefaultGroup();
          const memberships: Membership[] = items.map((i) => ({
            groupId: defaultGroup.id,
            ticker: i.ticker,
            addedAt: i.addedAt,
          }));
          const stockMeta: Record<string, StockMeta> = {};
          for (const i of items) {
            stockMeta[i.ticker] = { name: i.name, market: i.market };
          }
          return {
            groups: [defaultGroup],
            memberships,
            stockMeta,
          } as WatchlistState;
        }
        return persistedState as WatchlistState;
      },
    }
  )
);

export const selectTickersByGroup = (
  state: WatchlistState,
  groupId: string
): Membership[] => {
  return state.memberships
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => b.addedAt - a.addedAt);
};

export const selectGroupsByTicker = (
  state: WatchlistState,
  ticker: string
): WatchlistGroup[] => {
  const groupIds = new Set(
    state.memberships.filter((m) => m.ticker === ticker).map((m) => m.groupId)
  );
  return state.groups
    .filter((g) => groupIds.has(g.id))
    .sort((a, b) => a.order - b.order);
};
