import type { Market, MarketRankingKind } from "@/shared/types/ranking";

export type RankingTabId =
  | "up"
  | "down"
  | "volume"
  | "trade-value"
  | "market-cap"
  | "top-interest";

// 요청 payload 를 tab 정의에 co-locate — kind + direction/by 를 여기서 확정해
// toKind 는 순수 매핑이 된다. UI·URL·hook·href 전부 이 배열만 참조.
export type RankingTabDef =
  | { id: "up"; label: string; kind: "fluctuation"; direction: "up" }
  | { id: "down"; label: string; kind: "fluctuation"; direction: "down" }
  | { id: "volume"; label: string; kind: "volume"; by: "volume" }
  | { id: "trade-value"; label: string; kind: "volume"; by: "value" }
  | { id: "market-cap"; label: string; kind: "market-cap" }
  | { id: "top-interest"; label: string; kind: "top-interest" };

export const RANKING_TABS = [
  { id: "up", label: "상승", kind: "fluctuation", direction: "up" },
  { id: "down", label: "하락", kind: "fluctuation", direction: "down" },
  { id: "volume", label: "거래량", kind: "volume", by: "volume" },
  { id: "trade-value", label: "거래대금", kind: "volume", by: "value" },
  { id: "market-cap", label: "시총 상위", kind: "market-cap" },
  { id: "top-interest", label: "관심 등록 상위", kind: "top-interest" },
] as const satisfies readonly RankingTabDef[];

export const DEFAULT_RANKING_TAB_ID: RankingTabId = "up";

const TAB_BY_ID: Record<RankingTabId, RankingTabDef> = RANKING_TABS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<RankingTabId, RankingTabDef>,
);

export const resolveRankingTab = (
  raw: string | null | undefined,
): RankingTabDef =>
  raw && raw in TAB_BY_ID
    ? TAB_BY_ID[raw as RankingTabId]
    : TAB_BY_ID[DEFAULT_RANKING_TAB_ID];

export const toRankingKind = (
  tab: RankingTabDef,
  market: Market,
): MarketRankingKind => {
  if (tab.kind === "fluctuation")
    return { kind: "fluctuation", direction: tab.direction, market };
  if (tab.kind === "volume")
    return { kind: "volume", by: tab.by, market };
  if (tab.kind === "market-cap") return { kind: "market-cap", market };
  return { kind: "top-interest", market };
};

export const toRankingHref = (tabId: RankingTabId, market: Market): string => {
  const p = new URLSearchParams();
  p.set("tab", tabId);
  p.set("market", market);
  return `/ranking?${p.toString()}`;
};
