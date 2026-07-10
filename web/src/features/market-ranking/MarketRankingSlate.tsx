"use client";

import { useState } from "react";
import Link from "next/link";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { PriceSign } from "@/shared/types/quote";
import type { MarketRankingItem } from "@/shared/types/ranking";
import type { KrxSession } from "@/shared/utils/market";
import { cn } from "@/lib/utils";
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

const SESSION_LABEL: Record<KrxSession, string> = {
  regular: "실시간",
  after: "장 마감",
  after_close: "장 마감",
  pre: "프리마켓",
  preopen: "장 개장 전",
  closed: "휴장",
};

type StatusProps = {
  session: KrxSession | undefined;
  failed: boolean;
};

const Status = ({ session, failed }: StatusProps) => {
  if (!session) return null;
  const isOpen = session === "regular";
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      {isOpen ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full bg-emerald-500"
          />
          {SESSION_LABEL[session]}
        </span>
      ) : (
        <span>{SESSION_LABEL[session]}</span>
      )}
      {failed && (
        <span className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
          일시 지연
        </span>
      )}
    </div>
  );
};

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: string;
};

const TabButton = ({ active, onClick, children }: TabButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "border-b-2 pb-2 text-sm transition-colors",
      active
        ? "border-foreground font-medium text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

type PillProps = {
  active: boolean;
  onClick: () => void;
  variant?: "neutral" | "up" | "down";
  children: string;
};

// 세그먼트 pill. 등락률 서브(상승/하락)는 up/down muted 톤, 거래량 서브는 무채색.
const Pill = ({ active, onClick, variant = "neutral", children }: PillProps) => {
  const activeCls =
    variant === "up"
      ? "bg-price-up-muted text-price-up"
      : variant === "down"
        ? "bg-price-down-muted text-price-down"
        : "bg-elevated text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm px-2.5 py-1 text-xs transition-colors",
        active ? activeCls : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
};

type RowProps = {
  item: MarketRankingItem;
  secondary: string | null; // "4,293만주" | "614억원" | null
  isLast: boolean;
};

const Row = ({ item, secondary, isLast }: RowProps) => (
  <li>
    <Link
      href={`/stocks/${item.ticker}`}
      className={cn(
        "flex items-center gap-3 transition-opacity hover:opacity-70",
        isLast ? "pt-3" : "py-3 first:pt-0 first:pb-3",
      )}
    >
      <span className="w-4 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
        {item.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-sm font-medium">{item.name}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {secondary ? `${item.ticker} · ${secondary}` : item.ticker}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">
          {item.price.toLocaleString("ko-KR")}원
        </p>
        <PriceChange
          change={item.change}
          changeRate={item.changePct}
          sign={toPriceSign(item.changeSign)}
          symbol="arrow"
          unit="원"
          size="xs"
        />
      </div>
    </Link>
  </li>
);

const SkeletonRows = () => (
  <ul className="divide-y divide-border/60">
    {Array.from({ length: TOP_N }).map((_, i) => (
      <li
        key={i}
        className={cn(
          "flex items-center gap-3",
          i === 0 ? "pb-3" : i === TOP_N - 1 ? "pt-3" : "py-3",
        )}
      >
        <div className="h-3 w-3 shrink-0 animate-pulse rounded bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 text-right">
          <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </li>
    ))}
  </ul>
);

export const MarketRankingSlate = () => {
  const [tab, setTab] = useState<TabId>("fluctuation");
  const [direction, setDirection] = useState<Direction>("up");
  const [by, setBy] = useState<VolumeBy>("volume");

  const kind =
    tab === "fluctuation"
      ? ({ kind: "fluctuation", direction } as const)
      : ({ kind: "volume", by } as const);

  const { items, failed, session, isLoading, isError } = useMarketRanking(kind);

  const rows = items.slice(0, TOP_N);
  const showEmpty = !isLoading && !isError && rows.length === 0;
  const showError = !isLoading && (isError || (failed && rows.length === 0));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">시장 순위</h2>
        <Status session={session} failed={failed && rows.length > 0} />
      </div>
      <StockPanel>
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
                  variant="up"
                >
                  상승
                </Pill>
                <Pill
                  active={direction === "down"}
                  onClick={() => setDirection("down")}
                  variant="down"
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
          <ul className="divide-y divide-border/60">
            {rows.map((item, i) => {
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
              return (
                <Row
                  key={item.ticker}
                  item={item}
                  secondary={secondary}
                  isLast={i === rows.length - 1}
                />
              );
            })}
          </ul>
        )}
      </StockPanel>
    </section>
  );
};
