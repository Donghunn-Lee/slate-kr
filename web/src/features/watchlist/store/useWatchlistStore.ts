import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addMembershipIn,
  createGroupIn,
  deleteGroupIn,
  moveGroupIn,
  moveMembershipIn,
  removeMembershipIn,
  renameGroupIn,
} from "./watchlistSnapshot";
import type {
  Membership,
  StockMeta,
  WatchlistGroup,
  WatchlistSnapshot,
} from "./watchlistSnapshot";

export type {
  Membership,
  StockMeta,
  WatchlistGroup,
  WatchlistSnapshot,
} from "./watchlistSnapshot";
export { MAX_WATCHLIST_SIZE } from "./watchlistSnapshot";

export type WatchlistItem = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  addedAt: number;
};

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
  moveMembership: (ticker: string, groupId: string, dir: "up" | "down") => void;

  addToWatchlist: (
    item: { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" },
    groupId?: string
  ) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;

  replaceAll: (snapshot: WatchlistSnapshot) => void;
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

      createGroup: (name) => set((s) => createGroupIn(s, name)),
      renameGroup: (id, name) => set((s) => renameGroupIn(s, id, name)),
      deleteGroup: (id) => set((s) => deleteGroupIn(s, id)),
      moveGroup: (id, dir) => set((s) => moveGroupIn(s, id, dir)),

      addMembership: (item, groupId) => {
        const next = addMembershipIn(get(), item, groupId);
        if (next === null) return false;
        set(next);
        return true;
      },

      removeMembership: (ticker, groupId) =>
        set((s) => removeMembershipIn(s, ticker, groupId)),

      moveMembership: (ticker, groupId, dir) =>
        set((s) => moveMembershipIn(s, ticker, groupId, dir)),

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
      version: 2,
      migrate: (persistedState, version) => {
        if (version === 0) {
          const old = persistedState as { items?: WatchlistItem[] };
          const items = [...(old?.items ?? [])].sort(
            (a, b) => b.addedAt - a.addedAt
          );
          const defaultGroup = createDefaultGroup();
          const memberships: Membership[] = items.map((i, idx) => ({
            groupId: defaultGroup.id,
            ticker: i.ticker,
            addedAt: i.addedAt,
            order: idx,
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
        if (version === 1) {
          const old = persistedState as {
            groups: WatchlistGroup[];
            memberships: Array<{
              groupId: string;
              ticker: string;
              addedAt: number;
            }>;
            stockMeta: Record<string, StockMeta>;
          };
          const nextMemberships: Membership[] = [];
          for (const g of old.groups) {
            const inGroup = old.memberships
              .filter((m) => m.groupId === g.id)
              .sort((a, b) => b.addedAt - a.addedAt);
            inGroup.forEach((m, idx) => {
              nextMemberships.push({
                groupId: m.groupId,
                ticker: m.ticker,
                addedAt: m.addedAt,
                order: idx,
              });
            });
          }
          return {
            ...old,
            memberships: nextMemberships,
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
    .sort((a, b) => a.order - b.order);
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
