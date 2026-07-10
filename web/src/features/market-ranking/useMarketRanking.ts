import { useQuery } from "@tanstack/react-query";
import type {
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";
import type { KrxSession } from "@/shared/utils/market";

// route 응답 계약(#075/#077 미러): 항상 200, failed/session/marketOpen 포함.
type MarketRankingResponse = {
  items: MarketRankingItem[];
  failed: boolean;
  session: KrxSession;
  marketOpen: boolean;
};

const POLL_INTERVAL_MS = 60_000;

// 4개 유한 카테고리에 대해 queryKey 를 안정 문자열로 분리. 탭 전환 시 이전 query 는
// gcTime 지나며 자연 정리 — 동시 4콜 폴링 방지.
const toKeyString = (k: MarketRankingKind): string =>
  k.kind === "fluctuation"
    ? `fluc-${k.direction}`
    : `vol-${k.by === "volume" ? "shares" : "value"}`;

// URL 파라미터 명은 route 계약 그대로 (kind=fluctuation&direction=… / kind=volume&by=shares|value).
const toSearchParams = (k: MarketRankingKind): string => {
  const p = new URLSearchParams();
  if (k.kind === "fluctuation") {
    p.set("kind", "fluctuation");
    p.set("direction", k.direction);
  } else {
    p.set("kind", "volume");
    p.set("by", k.by === "volume" ? "shares" : "value");
  }
  return p.toString();
};

type UseMarketRankingResult = {
  items: MarketRankingItem[];
  failed: boolean;
  session: KrxSession | undefined;
  isLoading: boolean;
  isError: boolean;
};

// 활성 카테고리 하나만 폴링. 이전 응답의 marketOpen=true 일 때만 60s 주기, 폐장 시 정지.
// !res.ok throw 유지(#078) — infra 5xx / 400(파라미터 오류) 는 route collapse 와 다른 계층의 진짜 장애.
// slice(상위 N) 는 컴포넌트 몫 — 훅은 route items 그대로 반환.
export const useMarketRanking = (
  kind: MarketRankingKind,
): UseMarketRankingResult => {
  const key = toKeyString(kind);
  const query = useQuery<MarketRankingResponse>({
    queryKey: ["market-ranking", key],
    queryFn: async () => {
      const res = await fetch(`/api/market-ranking?${toSearchParams(kind)}`);
      if (!res.ok) throw new Error("market ranking fetch failed");
      return res.json();
    },
    refetchInterval: (q) =>
      q.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });

  return {
    items: query.data?.items ?? [],
    failed: query.data?.failed ?? false,
    session: query.data?.session,
    isLoading: query.isLoading,
    isError: query.isError,
  };
};
