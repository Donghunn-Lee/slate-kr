"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceChange } from "@/shared/components/PriceChange";
import { useMultiQuote } from "@/features/multi-quote/useMultiQuote";
import { useWatchlistStore, type WatchlistItem } from "./store/useWatchlistStore";
import type { TickerPriceSummary } from "@/app/api/prices/route";

function formatClose(close: number) {
  return close.toLocaleString("ko-KR") + "원";
}

export function WatchlistPreview() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);

  const preview = useMemo<WatchlistItem[]>(() => {
    const latestByTicker = new Map<string, number>();
    for (const m of memberships) {
      const cur = latestByTicker.get(m.ticker);
      if (cur === undefined || m.addedAt > cur) latestByTicker.set(m.ticker, m.addedAt);
    }
    return Array.from(latestByTicker.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ticker, addedAt]) => {
        const meta = stockMeta[ticker];
        if (!meta) return null;
        return { ticker, name: meta.name, market: meta.market, addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [memberships, stockMeta]);

  const tickersKey = preview.map((p) => p.ticker).join(",");

  const pricesQuery = useQuery<TickerPriceSummary[]>({
    queryKey: ["home-prices", tickersKey],
    queryFn: async () => {
      const r = await fetch(`/api/prices?tickers=${tickersKey}`);
      if (!r.ok) throw new Error("prices fetch failed");
      return r.json();
    },
    enabled: tickersKey.length > 0,
  });

  const pricesMap = useMemo(
    () => Object.fromEntries((pricesQuery.data ?? []).map((p) => [p.ticker, p])),
    [pricesQuery.data]
  );

  const { quotes: liveQuotes, failed: liveFailed } = useMultiQuote(
    preview.map((p) => p.ticker)
  );

  if (!mounted) return null;

  if (preview.length === 0) {
    return (
      <section>
        <StockPanel>
          <p className="text-sm text-muted-foreground">
            저장한 관심종목을 여기서 모아 볼 수 있어요
          </p>
          <Link
            href="/watchlist"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-70"
          >
            관심종목 둘러보기 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </StockPanel>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">내 관심종목</h2>
        <Link
          href="/watchlist"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <StockPanel>
        {pricesQuery.isError ? (
          <p className="text-sm text-muted-foreground">관심종목 데이터를 불러오지 못했습니다</p>
        ) : null}
        <ul>
          {preview.map((item) => {
            const p = pricesMap[item.ticker];
            const live = liveQuotes[item.ticker] ?? null;
            const isLiveFailed = liveFailed[item.ticker] ?? false;
            const displayPrice = live ? live.price : (p?.close ?? null);
            const displayChange = live ? live.change : (p?.change ?? null);
            const displayChangeRate = live ? live.changeRate : (p?.changePct ?? null);
            const displaySign = live ? live.sign : undefined;
            return (
              <li
                key={item.ticker}
                className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40"
              >
                <div className="border-b border-subtle py-1.5 group-last:border-b-0">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] leading-none text-muted-foreground tabular-nums">
                      {item.market}
                    </span>
                    {isLiveFailed && (
                      <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                        일시 지연
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {item.name}
                    </span>
                    <div className="flex shrink-0 items-baseline gap-2">
                      {displayPrice !== null ? (
                        <>
                          <span className="text-sm font-bold leading-none tabular-nums text-foreground">
                            {formatClose(displayPrice)}
                          </span>
                          {displayChange !== null && displayChangeRate !== null && (
                            <PriceChange
                              change={displayChange}
                              changeRate={displayChangeRate}
                              sign={displaySign}
                              symbol="sign"
                              unit="원"
                              size="xs"
                              className="leading-none"
                            />
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/stocks/${item.ticker}`}
                  aria-label={`${item.name} 상세 보기`}
                  className="absolute inset-0"
                />
              </li>
            );
          })}
        </ul>
      </StockPanel>
    </section>
  );
}
