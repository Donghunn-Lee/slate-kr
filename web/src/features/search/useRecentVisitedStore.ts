import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ITEMS = 50;

export type RecentVisited = {
  ticker: string;
  name: string;
};

type RecentVisitedState = {
  items: RecentVisited[];
  add: (ticker: string, name: string) => void;
  remove: (ticker: string) => void;
};

export const useRecentVisitedStore = create<RecentVisitedState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (ticker, name) => {
        const filtered = get().items.filter((i) => i.ticker !== ticker);
        set({ items: [{ ticker, name }, ...filtered].slice(0, MAX_ITEMS) });
      },
      remove: (ticker) => set({ items: get().items.filter((i) => i.ticker !== ticker) }),
    }),
    { name: "slatekr-recent-visited" }
  )
);
