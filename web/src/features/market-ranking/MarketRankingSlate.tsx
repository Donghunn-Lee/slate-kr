"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { PriceSign } from "@/shared/types/quote";
import type { Market, MarketRankingItem } from "@/shared/types/ranking";
import { cn } from "@/lib/utils";
import { Pill, TabButton } from "./RankingControls";
import { useMarketRanking } from "./useMarketRanking";

const TOP_N = 5;

type TabId = "fluctuation" | "volume";
type Direction = "up" | "down";
type VolumeBy = "volume" | "value";

// KIS prdy_vrss_sign(1상한/2상승/3보합/4하한/5하락) → PriceChange 가 소비하는 PriceSign.
// 순위는 lib 계층에서 원본 문자열 보존 — 소비 경계에서 정규화(중복 로직 신설 대신 소수 매핑 유지).
const toPriceSign = (code: string): PriceSign =>
  code === "3" ? "flat" : code === "1" || code === "2" ? "up" : "down";

// 거래량(주) 압축. 억/만 단위. 순위 슬레이트 행에서 가독성 확보용.
const compactShares = (n: number): string => {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억주";
  if (n >= 10_000)
    return Math.round(n / 10_000).toLocaleString("ko-KR") + "만주";
  return n.toLocaleString("ko-KR") + "주";
};

type RowProps = {
  item: MarketRankingItem;
  secondary: string | null; // "4,293만주" | "614억원" | null
};

// 좌측 순위 전용 컬럼 + 우측 콘텐츠. rank 는 숫자만, mono/muted, 세로 중앙 정렬.
// 상단 mini row: 좌=시장구분(KOSPI/KOSDAQ), 우=secondary(거래량/거래대금). 양쪽 다 없으면 mini row 자체를 생략.
const Row = ({ item, secondary }: RowProps) => (
  <li className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40">
    <div className="flex items-stretch gap-3 border-b border-subtle py-1.5 group-last:border-b-0">
      <span className="flex w-7 shrink-0 items-center justify-center font-mono text-sm tabular-nums text-muted-foreground">
        {item.rank}
      </span>
      <div className="min-w-0 flex-1">
        {(item.market || secondary) && (
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] leading-none text-muted-foreground">
            <span className="tabular-nums">{item.market ?? ""}</span>
            {secondary && <span className="tabular-nums">{secondary}</span>}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {item.name}
          </span>
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-sm font-bold leading-none tabular-nums text-foreground">
              {item.price.toLocaleString("ko-KR")}원
            </span>
            <PriceChange
              change={item.change}
              changeRate={item.changePct}
              sign={toPriceSign(item.changeSign)}
              symbol="sign"
              unit="원"
              size="xs"
              className="leading-none"
            />
          </div>
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

const SkeletonRows = () => (
  <ul>
    {Array.from({ length: TOP_N }).map((_, i) => (
      <li key={i} className="group -mx-6 animate-pulse px-6">
        <div className="flex items-stretch gap-3 border-b border-subtle py-1.5 group-last:border-b-0">
          <div className="flex w-7 shrink-0 items-center justify-center">
            <div className="h-3.5 w-3 rounded bg-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <div className="h-3 w-10 rounded bg-muted" />
              <div className="h-3 w-14 rounded bg-muted" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="flex shrink-0 items-end gap-2">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </li>
    ))}
  </ul>
);

const MARKET_LABEL: Record<Market, string> = {
  all: "전체",
  kospi: "KOSPI",
  kosdaq: "KOSDAQ",
};
const MARKETS: readonly Market[] = ["all", "kospi", "kosdaq"];

// "전체 보기" 링크가 현재 필터를 그대로 페이지에 전달. route 계약과 동일한 파라미터 명명.
const toRankingHref = (
  tab: TabId,
  direction: Direction,
  by: VolumeBy,
  market: Market,
): string => {
  const p = new URLSearchParams();
  if (tab === "fluctuation") {
    p.set("kind", "fluctuation");
    p.set("direction", direction);
  } else {
    p.set("kind", "volume");
    p.set("by", by === "volume" ? "shares" : "value");
  }
  p.set("market", market);
  return `/ranking?${p.toString()}`;
};

export const MarketRankingSlate = () => {
  const [tab, setTab] = useState<TabId>("fluctuation");
  const [direction, setDirection] = useState<Direction>("up");
  const [by, setBy] = useState<VolumeBy>("volume");
  const [market, setMarket] = useState<Market>("all");

  const kind =
    tab === "fluctuation"
      ? ({ kind: "fluctuation", direction, market } as const)
      : ({ kind: "volume", by, market } as const);

  const { items, failed, isLoading, isError, isPlaceholderData } =
    useMarketRanking(kind);

  const rows = items.slice(0, TOP_N);
  const showEmpty = !isLoading && !isError && rows.length === 0;
  const showError = !isLoading && (isError || (failed && rows.length === 0));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">시장 순위</h2>
        <div className="flex items-center gap-3">
          {/* rows 는 있지만 route 가 부분 실패 — 표시값이 stale 임을 알리는 유일한 신호. */}
          {failed && rows.length > 0 && (
            <span className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
              일시 지연
            </span>
          )}
          <Link
            href={toRankingHref(tab, direction, by, market)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            전체 보기 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <StockPanel>
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {MARKETS.map((m) => (
            <Pill
              key={m}
              active={market === m}
              onClick={() => setMarket(m)}
            >
              {MARKET_LABEL[m]}
            </Pill>
          ))}
        </div>
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/60">
          <div className="flex items-center gap-5">
            <TabButton
              active={tab === "fluctuation"}
              onClick={() => setTab("fluctuation")}
            >
              등락률
            </TabButton>
            <TabButton
              active={tab === "volume"}
              onClick={() => setTab("volume")}
            >
              거래량
            </TabButton>
          </div>
          <div className="flex items-center gap-1 pb-1.5">
            {tab === "fluctuation" ? (
              <>
                <Pill
                  active={direction === "up"}
                  onClick={() => setDirection("up")}
                >
                  상승
                </Pill>
                <Pill
                  active={direction === "down"}
                  onClick={() => setDirection("down")}
                >
                  하락
                </Pill>
              </>
            ) : (
              <>
                <Pill active={by === "volume"} onClick={() => setBy("volume")}>
                  거래량
                </Pill>
                <Pill active={by === "value"} onClick={() => setBy("value")}>
                  거래대금
                </Pill>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : showError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            데이터를 일시적으로 불러오지 못했습니다
          </p>
        ) : showEmpty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            표시할 순위가 없습니다
          </p>
        ) : (
          <ul
            className={cn(
              "transition-opacity",
              isPlaceholderData && "opacity-70",
            )}
          >
            {rows.map((item) => {
              const secondary =
                tab === "volume"
                  ? by === "volume"
                    ? item.volume !== undefined
                      ? compactShares(item.volume)
                      : null
                    : item.tradeValue !== undefined
                      ? formatMarketCap(item.tradeValue)
                      : null
                  : null;
              return <Row key={item.ticker} item={item} secondary={secondary} />;
            })}
          </ul>
        )}
      </StockPanel>
    </section>
  );
};
