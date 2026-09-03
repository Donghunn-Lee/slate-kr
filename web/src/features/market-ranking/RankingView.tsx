"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, WifiOff } from "lucide-react";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import { StockPanel } from "@/entities/stock/StockPanel";
import { cn } from "@/lib/utils";
import type { Market } from "@/shared/types/ranking";
import { Pill } from "./RankingControls";
import { RankingHeader, RankingRow, RankingRowSkeleton } from "./RankingRow";
import { RankingTabStrip, type RankingTabItem } from "./RankingTabStrip";
import {
  RANKING_TABS,
  resolveRankingTab,
  toRankingHref,
  toRankingKind,
  type RankingTabId,
} from "./rankingTabs";
import { useMarketRanking } from "./useMarketRanking";

type RankingViewProps = {
  initialTabId: RankingTabId;
  initialMarket: Market;
};

const MARKET_LABEL: Record<Market, string> = {
  all: "전체",
  kospi: "KOSPI",
  kosdaq: "KOSDAQ",
};
const MARKETS: readonly Market[] = ["all", "kospi", "kosdaq"];

const TAB_ITEMS: readonly RankingTabItem<RankingTabId>[] = RANKING_TABS.map(
  (t) => ({ id: t.id, label: t.label }),
);

const SKELETON_ROWS = 10;

export const RankingView = ({
  initialTabId,
  initialMarket,
}: RankingViewProps) => {
  const router = useRouter();
  const [tabId, setTabId] = useState<RankingTabId>(initialTabId);
  const [market, setMarket] = useState<Market>(initialMarket);

  const kind = useMemo(
    () => toRankingKind(resolveRankingTab(tabId), market),
    [tabId, market],
  );

  // 단방향 sync (state → URL). useSearchParams 를 소스로 삼지 않음 — 매 필터 변경이
  // 서버 왕복이 되어 keepPreviousData 로 잡은 전환 깜빡임(#079)을 되살린다.
  useEffect(() => {
    router.replace(toRankingHref(tabId, market), { scroll: false });
  }, [tabId, market, router]);

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

  const showFailure = !isLoading && (isError || failed);
  const showEmpty = !isLoading && !showFailure && items.length === 0;
  const showResults = !isLoading && !showFailure && !showEmpty;

  return (
    <StockPanel className="p-4 md:p-6">
      <div className="mb-2 flex flex-wrap items-center gap-1 sm:mb-3">
        {MARKETS.map((m) => (
          <Pill key={m} active={market === m} onClick={() => setMarket(m)}>
            {MARKET_LABEL[m]}
          </Pill>
        ))}
      </div>
      <div className="mb-3 flex items-end gap-3 border-b border-border/60 sm:mb-4">
        <RankingTabStrip
          items={TAB_ITEMS}
          activeId={tabId}
          onSelect={setTabId}
        />
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

      {showResults && (
        <p className="mt-3 text-caption text-muted-foreground">
          KRX 기준 집계 · 관심종목은 KIS 고객 등록 수 기준
        </p>
      )}
    </StockPanel>
  );
};
