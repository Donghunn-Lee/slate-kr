"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceChange } from "@/shared/components/PriceChange";
import { useMultiQuote } from "@/features/multi-quote/useMultiQuote";
import { useWatchlistStore, type WatchlistItem } from "./store/useWatchlistStore";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatClose(close: number) {
  return close.toLocaleString("ko-KR") + "원";
}

export function WatchlistPreview() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const groups = useWatchlistStore((s) => s.groups);
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order),
    [groups]
  );

  // 선택 그룹은 컴포넌트 local state (persist 안 함). 삭제/부재 시 첫 그룹으로 폴백.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const effectiveGroupId = useMemo(() => {
    if (sortedGroups.length === 0) return null;
    if (selectedGroupId && sortedGroups.some((g) => g.id === selectedGroupId)) {
      return selectedGroupId;
    }
    return sortedGroups[0].id;
  }, [selectedGroupId, sortedGroups]);

  // /watchlist 페이지와 동일한 order 오름차순(first-in) 렌더 — slice 없음.
  const items = useMemo<WatchlistItem[]>(() => {
    if (!effectiveGroupId) return [];
    return memberships
      .filter((m) => m.groupId === effectiveGroupId)
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const meta = stockMeta[m.ticker];
        if (!meta) return null;
        return { ticker: m.ticker, name: meta.name, market: meta.market, addedAt: m.addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [effectiveGroupId, memberships, stockMeta]);

  const tickersKey = items.map((p) => p.ticker).join(",");

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
    items.map((p) => p.ticker)
  );

  // 스크롤 오버플로우 감지 — 넘칠 때만 하단 fade 마스크 노출.
  // 리스트가 없는 렌더에서는 ref 가 없고 fade 도 렌더되지 않으므로 상태 리셋 불필요.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  if (!mounted) return null;

  // groups 자체 0개(엣지) — 현행 빈 상태 전체 렌더 폴백.
  if (sortedGroups.length === 0) {
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

  const singleGroup = sortedGroups.length === 1;

  return (
    <section className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">내 관심종목</h2>
        <Link
          href="/watchlist"
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <StockPanel className="flex min-h-0 flex-1 flex-col">
        {/* 슬레이트 내부 좌측 상단에 붙이는 그룹 선택 — 제목 톤(semibold foreground). 트리거는 border/shadow/ring 제거해 클릭 시 시각적 확대감 없음. */}
        <div className="mb-3 flex min-w-0">
          {singleGroup ? (
            <span className="truncate text-base font-semibold text-foreground">
              {sortedGroups[0].name}
            </span>
          ) : (
            <Select
              value={effectiveGroupId ?? undefined}
              onValueChange={setSelectedGroupId}
            >
              <SelectTrigger
                className="h-auto min-w-0 gap-1.5 rounded-none border-0 bg-transparent p-0 text-base font-semibold text-foreground shadow-none hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start">
                {sortedGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <Star className="size-5 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">
              이 그룹에 저장된 종목이 없어요
            </p>
            <Link
              href="/watchlist"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-70"
            >
              관심종목 추가하기 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <>
            {pricesQuery.isError && (
              <p className="mb-2 text-sm text-muted-foreground">
                관심종목 데이터를 불러오지 못했습니다
              </p>
            )}
            {/* -mx-6: 스크롤 래퍼를 패널 좌우 엣지까지 확장해 hover bg 가 원본과 동일한 폭을 갖게 함. */}
            <div className="relative -mx-6 min-h-0 flex-1">
              <div ref={scrollRef} className="h-full overflow-y-auto">
                <ul>
                  {items.map((item) => {
                    const p = pricesMap[item.ticker];
                    const live = liveQuotes[item.ticker] ?? null;
                    const isLiveFailed = liveFailed[item.ticker] ?? false;
                    const displayPrice = live ? live.price : (p?.close ?? null);
                    const displayChange = live ? live.change : (p?.change ?? null);
                    const displayChangeRate = live
                      ? live.changeRate
                      : (p?.changePct ?? null);
                    const displaySign = live ? live.sign : undefined;
                    return (
                      <li
                        key={item.ticker}
                        className="group relative bg-transparent px-6 transition-colors hover:bg-muted/40"
                      >
                        <div className="border-b border-subtle py-1.5 group-last:border-b-0">
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span className="text-[10px] leading-none tracking-wide text-muted-foreground">
                              {item.market}
                            </span>
                            {isLiveFailed && (
                              <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
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
              </div>
              {isOverflowing && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-elevated to-transparent" />
              )}
            </div>
          </>
        )}
      </StockPanel>
    </section>
  );
}
