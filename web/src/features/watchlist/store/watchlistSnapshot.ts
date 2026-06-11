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
  order: number;
};

export type StockMeta = {
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export type WatchlistSnapshot = {
  groups: WatchlistGroup[];
  memberships: Membership[];
  stockMeta: Record<string, StockMeta>;
};

export const MAX_WATCHLIST_SIZE = 100;

export const createGroupIn = (
  s: WatchlistSnapshot,
  name: string
): WatchlistSnapshot => {
  const maxOrder =
    s.groups.length === 0 ? -1 : Math.max(...s.groups.map((g) => g.order));
  return {
    ...s,
    groups: [
      ...s.groups,
      {
        id: crypto.randomUUID(),
        name,
        order: maxOrder + 1,
        createdAt: Date.now(),
      },
    ],
  };
};

export const renameGroupIn = (
  s: WatchlistSnapshot,
  id: string,
  name: string
): WatchlistSnapshot => ({
  ...s,
  groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)),
});

export const deleteGroupIn = (
  s: WatchlistSnapshot,
  id: string
): WatchlistSnapshot => {
  const removedTickers = new Set(
    s.memberships.filter((m) => m.groupId === id).map((m) => m.ticker)
  );
  const nextMemberships = s.memberships.filter((m) => m.groupId !== id);
  const nextStockMeta = { ...s.stockMeta };
  for (const ticker of removedTickers) {
    if (!nextMemberships.some((m) => m.ticker === ticker)) {
      delete nextStockMeta[ticker];
    }
  }
  return {
    groups: s.groups.filter((g) => g.id !== id),
    memberships: nextMemberships,
    stockMeta: nextStockMeta,
  };
};

export const moveGroupIn = (
  s: WatchlistSnapshot,
  id: string,
  dir: "up" | "down"
): WatchlistSnapshot => {
  const sorted = [...s.groups].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((g) => g.id === id);
  if (idx === -1) return s;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return s;
  const current = sorted[idx];
  const neighbor = sorted[swapIdx];
  return {
    ...s,
    groups: s.groups.map((g) => {
      if (g.id === current.id) return { ...g, order: neighbor.order };
      if (g.id === neighbor.id) return { ...g, order: current.order };
      return g;
    }),
  };
};

export const addMembershipIn = (
  s: WatchlistSnapshot,
  item: { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" },
  groupId: string
): WatchlistSnapshot | null => {
  if (
    s.memberships.some(
      (m) => m.groupId === groupId && m.ticker === item.ticker
    )
  ) {
    return s;
  }
  const isNewTicker = !s.memberships.some((m) => m.ticker === item.ticker);
  if (isNewTicker) {
    const distinctCount = new Set(s.memberships.map((m) => m.ticker)).size;
    if (distinctCount >= MAX_WATCHLIST_SIZE) return null;
  }
  const groupMemberships = s.memberships.filter((m) => m.groupId === groupId);
  const maxOrder =
    groupMemberships.length === 0
      ? -1
      : Math.max(...groupMemberships.map((m) => m.order));
  return {
    ...s,
    memberships: [
      ...s.memberships,
      {
        groupId,
        ticker: item.ticker,
        addedAt: Date.now(),
        order: maxOrder + 1,
      },
    ],
    stockMeta: {
      ...s.stockMeta,
      [item.ticker]: { name: item.name, market: item.market },
    },
  };
};

export const moveMembershipIn = (
  s: WatchlistSnapshot,
  ticker: string,
  groupId: string,
  dir: "up" | "down"
): WatchlistSnapshot => {
  const inGroup = s.memberships
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => a.order - b.order);
  const idx = inGroup.findIndex((m) => m.ticker === ticker);
  if (idx === -1) return s;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= inGroup.length) return s;
  const current = inGroup[idx];
  const neighbor = inGroup[swapIdx];
  return {
    ...s,
    memberships: s.memberships.map((m) => {
      if (m.groupId !== groupId) return m;
      if (m.ticker === current.ticker) return { ...m, order: neighbor.order };
      if (m.ticker === neighbor.ticker) return { ...m, order: current.order };
      return m;
    }),
  };
};

export const removeMembershipIn = (
  s: WatchlistSnapshot,
  ticker: string,
  groupId: string
): WatchlistSnapshot => {
  const nextMemberships = s.memberships.filter(
    (m) => !(m.groupId === groupId && m.ticker === ticker)
  );
  const nextStockMeta = { ...s.stockMeta };
  if (!nextMemberships.some((m) => m.ticker === ticker)) {
    delete nextStockMeta[ticker];
  }
  return {
    ...s,
    memberships: nextMemberships,
    stockMeta: nextStockMeta,
  };
};
