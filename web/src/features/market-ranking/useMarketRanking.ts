import { keepPreviousData, useQuery } from "@tanstack/react-query";
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

// kind × market = 12 유한 조합에 대해 queryKey 를 안정 문자열로 분리. 탭/시장 전환 시
// 이전 query 는 gcTime 지나며 자연 정리 — 동시 콜 폴링 방지.
const toKeyString = (k: MarketRankingKind): string => {
  const suffix = `-${k.market}`;
  return k.kind === "fluctuation"
    ? `fluc-${k.direction}${suffix}`
    : `vol-${k.by === "volume" ? "shares" : "value"}${suffix}`;
};

// URL 파라미터 명은 route 계약 그대로 (kind=fluctuation&direction=… / kind=volume&by=shares|value / market=…).
const toSearchParams = (k: MarketRankingKind): string => {
  const p = new URLSearchParams();
  if (k.kind === "fluctuation") {
    p.set("kind", "fluctuation");
    p.set("direction", k.direction);
  } else {
    p.set("kind", "volume");
    p.set("by", k.by === "volume" ? "shares" : "value");
  }
  p.set("market", k.market);
  return p.toString();
};

type UseMarketRankingResult = {
  items: MarketRankingItem[];
  failed: boolean;
  session: KrxSession | undefined;
  isLoading: boolean;
  isError: boolean;
  // 카테고리 전환 중 이전 데이터를 표시하고 있는가 (placeholderData 노출).
  // 소비측이 리스트를 opacity 로 살짝 어둡히는 등 전환 신호로 사용.
  isPlaceholderData: boolean;
};

// 활성 카테고리 하나만 폴링. 이전 응답의 marketOpen=true 일 때만 60s 주기, 폐장 시 정지.
// !res.ok throw 유지(#078) — infra 5xx / 400(파라미터 오류) 는 route collapse 와 다른 계층의 진짜 장애.
// slice(상위 N) 는 컴포넌트 몫 — 훅은 route items 그대로 반환.
// placeholderData: keepPreviousData — 탭/시장 전환 시 이전 카테고리 결과 유지 → skeleton 깜빡임 제거.
// isLoading (v5: isPending && isFetching) 은 placeholder 존재 시 false 이므로 최초 mount 에만 skeleton 노출.
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
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });

  return {
    items: query.data?.items ?? [],
    failed: query.data?.failed ?? false,
    session: query.data?.session,
    isLoading: query.isLoading,
    isError: query.isError,
    isPlaceholderData: query.isPlaceholderData,
  };
};
