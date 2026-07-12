"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, WifiOff } from "lucide-react";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import { StockPanel } from "@/entities/stock/StockPanel";
import { cn } from "@/lib/utils";
import type { Market, MarketRankingKind } from "@/shared/types/ranking";
import { Pill, TabButton } from "./RankingControls";
import { RankingHeader, RankingRow, RankingRowSkeleton } from "./RankingRow";
import { useMarketRanking } from "./useMarketRanking";

type RankingViewProps = {
  initialKind: MarketRankingKind;
};

const MARKET_LABEL: Record<Market, string> = {
  all: "전체",
  kospi: "KOSPI",
  kosdaq: "KOSDAQ",
};
const MARKETS: readonly Market[] = ["all", "kospi", "kosdaq"];

const SKELETON_ROWS = 10;

// 홈 슬레이트/route 계약과 동일한 URL 파라미터 명명: kind, direction, by=shares|value, market.
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

export const RankingView = ({ initialKind }: RankingViewProps) => {
  const router = useRouter();
  const [kind, setKind] = useState<MarketRankingKind>(initialKind);

  // 단방향 sync (state → URL). useSearchParams 를 소스로 삼지 않음 — 매 필터 변경이
  // 서버 왕복이 되어 keepPreviousData 로 잡은 전환 깜빡임(#079)을 되살린다.
  useEffect(() => {
    router.replace(`/ranking?${toSearchParams(kind)}`, { scroll: false });
  }, [kind, router]);

  const {
    items,
    failed,
    isLoading,
    isError,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useMarketRanking(kind);

  const tickersKey = items.map((i) => i.ticker).join(",");
  const disclosureQuery = useQuery<TickerDisclosureCount[]>({
    queryKey: ["ranking-disclosures-recent-count", tickersKey],
    queryFn: async () => {
      const r = await fetch(
        `/api/disclosures/recent-count?tickers=${tickersKey}`,
      );
      if (!r.ok) throw new Error("disclosure count fetch failed");
      return r.json();
    },
    enabled: items.length > 0,
  });

  const disclosureMap = useMemo(
    () =>
      Object.fromEntries(
        (disclosureQuery.data ?? []).map((d) => [d.ticker, d]),
      ),
    [disclosureQuery.data],
  );

  const handleTab = (t: "fluctuation" | "volume") => {
    if (t === kind.kind) return;
    setKind(
      t === "fluctuation"
        ? {
            kind: "fluctuation",
            direction: "up",
            market: kind.market,
          }
        : { kind: "volume", by: "volume", market: kind.market },
    );
  };

  const handleMarket = (m: Market) => {
    if (m === kind.market) return;
    setKind({ ...kind, market: m });
  };

  const handleDirection = (d: "up" | "down") => {
    if (kind.kind !== "fluctuation" || kind.direction === d) return;
    setKind({ ...kind, direction: d });
  };

  const handleBy = (b: "volume" | "value") => {
    if (kind.kind !== "volume" || kind.by === b) return;
    setKind({ ...kind, by: b });
  };

  const showFailure = !isLoading && (isError || failed);
  const showEmpty = !isLoading && !showFailure && items.length === 0;

  return (
    <StockPanel className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {MARKETS.map((m) => (
          <Pill
            key={m}
            active={kind.market === m}
            onClick={() => handleMarket(m)}
          >
            {MARKET_LABEL[m]}
          </Pill>
        ))}
      </div>
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/60">
        <div className="flex items-center gap-5">
          <TabButton
            active={kind.kind === "fluctuation"}
            onClick={() => handleTab("fluctuation")}
          >
            등락률
          </TabButton>
          <TabButton
            active={kind.kind === "volume"}
            onClick={() => handleTab("volume")}
          >
            거래량
          </TabButton>
        </div>
        <div className="flex items-center gap-1 pb-1.5">
          {kind.kind === "fluctuation" ? (
            <>
              <Pill
                active={kind.direction === "up"}
                onClick={() => handleDirection("up")}
              >
                상승
              </Pill>
              <Pill
                active={kind.direction === "down"}
                onClick={() => handleDirection("down")}
              >
                하락
              </Pill>
            </>
          ) : (
            <>
              <Pill
                active={kind.by === "volume"}
                onClick={() => handleBy("volume")}
              >
                거래량
              </Pill>
              <Pill
                active={kind.by === "value"}
                onClick={() => handleBy("value")}
              >
                거래대금
              </Pill>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <>
          <RankingHeader kind={kind} />
          <ul>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <RankingRowSkeleton key={i} />
            ))}
          </ul>
        </>
      ) : showFailure ? (
        <div className="flex w-full flex-col items-center justify-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
            <WifiOff
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              순위 데이터를 일시적으로 불러오지 못했어요
            </p>
            <p className="text-xs text-muted-foreground">
              잠시 후 다시 시도해 주세요
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-subtle disabled:hover:text-muted-foreground"
          >
            <RefreshCw
              className={cn("h-3 w-3", isFetching && "animate-spin")}
              aria-hidden="true"
            />
            다시 시도
          </button>
        </div>
      ) : showEmpty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          표시할 순위가 없습니다
        </p>
      ) : (
        <>
          <RankingHeader kind={kind} />
          <ul
            className={cn(
              "transition-opacity",
              isPlaceholderData && "opacity-70",
            )}
          >
            {items.map((item) => (
              <RankingRow
                key={item.ticker}
                item={item}
                disclosure={disclosureMap[item.ticker]}
                kind={kind}
              />
            ))}
          </ul>
        </>
      )}
    </StockPanel>
  );
};
