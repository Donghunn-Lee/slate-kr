import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WatchlistItem = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  addedAt: number;
};

const MAX_WATCHLIST_SIZE = 50;

type WatchlistState = {
  items: WatchlistItem[];
  addToWatchlist: (item: Omit<WatchlistItem, "addedAt">) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;
};

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],

      addToWatchlist: (item) => {
        const { items } = get();
        if (items.length >= MAX_WATCHLIST_SIZE) return;
        if (items.some((i) => i.ticker === item.ticker)) return;
        set({ items: [...items, { ...item, addedAt: Date.now() }] });
      },

      removeFromWatchlist: (ticker) => {
        set({ items: get().items.filter((i) => i.ticker !== ticker) });
      },

      isInWatchlist: (ticker) => {
        return get().items.some((i) => i.ticker === ticker);
      },
    }),
    {
      name: "slatekr-watchlist",
    }
  )
);
