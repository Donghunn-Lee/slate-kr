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

export const MAX_WATCHLIST_SIZE = 100;
const DEFAULT_GROUP_NAME = "내 관심 종목";

type WatchlistState = {
  groups: WatchlistGroup[];
  memberships: Membership[];
  stockMeta: Record<string, StockMeta>;

  createGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  moveGroup: (id: string, dir: "up" | "down") => void;

  addMembership: (
    item: { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" },
    groupId: string
  ) => boolean;
  removeMembership: (ticker: string, groupId: string) => void;

  addToWatchlist: (
    item: { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" },
    groupId?: string
  ) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;

  replaceAll: (snapshot: WatchlistSnapshot) => void;
};

export type WatchlistSnapshot = Pick<
  WatchlistState,
  "groups" | "memberships" | "stockMeta"
>;

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

      createGroup: (name) => {
        const { groups } = get();
        const maxOrder = groups.length === 0
          ? -1
          : Math.max(...groups.map((g) => g.order));
        set({
          groups: [
            ...groups,
            {
              id: crypto.randomUUID(),
              name,
              order: maxOrder + 1,
              createdAt: Date.now(),
            },
          ],
        });
      },

      renameGroup: (id, name) => {
        set({
          groups: get().groups.map((g) =>
            g.id === id ? { ...g, name } : g
          ),
        });
      },

      deleteGroup: (id) => {
        const { groups, memberships, stockMeta } = get();
        const removedTickers = new Set(
          memberships.filter((m) => m.groupId === id).map((m) => m.ticker)
        );
        const nextMemberships = memberships.filter((m) => m.groupId !== id);
        const nextStockMeta = { ...stockMeta };
        for (const ticker of removedTickers) {
          if (!nextMemberships.some((m) => m.ticker === ticker)) {
            delete nextStockMeta[ticker];
          }
        }
        set({
          groups: groups.filter((g) => g.id !== id),
          memberships: nextMemberships,
          stockMeta: nextStockMeta,
        });
      },

      moveGroup: (id, dir) => {
        const { groups } = get();
        const sorted = [...groups].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((g) => g.id === id);
        if (idx === -1) return;
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= sorted.length) return;
        const current = sorted[idx];
        const neighbor = sorted[swapIdx];
        set({
          groups: groups.map((g) => {
            if (g.id === current.id) return { ...g, order: neighbor.order };
            if (g.id === neighbor.id) return { ...g, order: current.order };
            return g;
          }),
        });
      },

      addMembership: (item, groupId) => {
        const { memberships, stockMeta } = get();
        if (
          memberships.some(
            (m) => m.groupId === groupId && m.ticker === item.ticker
          )
        ) {
          return true;
        }
        const isNewTicker = !memberships.some((m) => m.ticker === item.ticker);
        if (isNewTicker) {
          const distinctCount = new Set(memberships.map((m) => m.ticker)).size;
          if (distinctCount >= MAX_WATCHLIST_SIZE) return false;
        }
        set({
          memberships: [
            ...memberships,
            { groupId, ticker: item.ticker, addedAt: Date.now() },
          ],
          stockMeta: {
            ...stockMeta,
            [item.ticker]: { name: item.name, market: item.market },
          },
        });
        return true;
      },

      removeMembership: (ticker, groupId) => {
        const { memberships, stockMeta } = get();
        const nextMemberships = memberships.filter(
          (m) => !(m.groupId === groupId && m.ticker === ticker)
        );
        const nextStockMeta = { ...stockMeta };
        if (!nextMemberships.some((m) => m.ticker === ticker)) {
          delete nextStockMeta[ticker];
        }
        set({ memberships: nextMemberships, stockMeta: nextStockMeta });
      },

      addToWatchlist: (item, groupId) => {
        const { groups } = get();
        if (groups.length === 0) return;
        const targetGroupId =
          groupId ?? [...groups].sort((a, b) => a.order - b.order)[0].id;
        get().addMembership(item, targetGroupId);
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

      replaceAll: (snapshot) => {
        const liveTickers = new Set(snapshot.memberships.map((m) => m.ticker));
        const gcedStockMeta: Record<string, StockMeta> = {};
        for (const ticker of Object.keys(snapshot.stockMeta)) {
          if (liveTickers.has(ticker)) {
            gcedStockMeta[ticker] = snapshot.stockMeta[ticker];
          }
        }
        set({
          groups: snapshot.groups,
          memberships: snapshot.memberships,
          stockMeta: gcedStockMeta,
        });
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
