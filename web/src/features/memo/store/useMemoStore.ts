import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MemoEntry, MemoSnapshot } from "@/shared/types/memo";

export type { MemoEntry, MemoSnapshot } from "@/shared/types/memo";

export type MemoSyncStatus =
  | "idle"
  | "loading"
  | "synced"
  | "blocked"
  | "error";

type MemoInput = {
  body: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

type MemoState = {
  memos: Record<string, MemoEntry>;

  syncStatus: MemoSyncStatus;
  setSyncStatus: (status: MemoSyncStatus) => void;

  setMemo: (ticker: string, input: MemoInput) => void;
  replaceAll: (snapshot: MemoSnapshot) => void;
};

export const useMemoStore = create<MemoState>()(
  persist(
    (set) => ({
      memos: {},

      syncStatus: "idle",
      setSyncStatus: (status) => set({ syncStatus: status }),

      setMemo: (ticker, input) =>
        set((s) => {
          const trimmed = input.body.trim();
          if (trimmed === "") {
            if (!(ticker in s.memos)) return s;
            const next = { ...s.memos };
            delete next[ticker];
            return { memos: next };
          }
          return {
            memos: {
              ...s.memos,
              [ticker]: {
                body: trimmed,
                name: input.name,
                market: input.market,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      replaceAll: (snapshot) => set({ memos: snapshot.memos }),
    }),
    {
      name: "slatekr-memos",
      version: 1,
      partialize: (s) => ({ memos: s.memos }),
    }
  )
);
