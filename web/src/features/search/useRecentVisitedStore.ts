import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ITEMS = 50;

export type RecentVisited = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

type RecentVisitedState = {
  items: RecentVisited[];
  add: (ticker: string, name: string, market: "KOSPI" | "KOSDAQ") => void;
  remove: (ticker: string) => void;
};

export const useRecentVisitedStore = create<RecentVisitedState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (ticker, name, market) => {
        const filtered = get().items.filter((i) => i.ticker !== ticker);
        set({ items: [{ ticker, name, market }, ...filtered].slice(0, MAX_ITEMS) });
      },
      remove: (ticker) => set({ items: get().items.filter((i) => i.ticker !== ticker) }),
    }),
    {
      name: "slatekr-recent-visited",
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0) {
          return { items: [] } as unknown as RecentVisitedState;
        }
        return persistedState as RecentVisitedState;
      },
    }
  )
);
