"use client";

import { useState } from "react";
import Link from "next/link";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { PriceSign } from "@/shared/types/quote";
import type { Market, MarketRankingItem } from "@/shared/types/ranking";
import type { KrxSession } from "@/shared/utils/market";
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

type RowProps = {
  item: MarketRankingItem;
  secondary: string | null; // "4,293만주" | "614억원" | null
};

// 좌측 순위 전용 컬럼 + 우측 콘텐츠(코드-first). rank 는 숫자만, mono/muted, 세로 중앙 정렬.
const Row = ({ item, secondary }: RowProps) => (
  <li className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40">
    <div className="flex items-stretch gap-3 border-b border-subtle pb-2 pt-1.5 group-last:border-b-0">
      <span className="flex w-7 shrink-0 items-center justify-center font-mono text-sm tabular-nums text-muted-foreground">
        {item.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-5 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] leading-none text-muted-foreground">
            {item.ticker}
          </span>
          {secondary && (
            <span className="ml-auto shrink-0 font-mono text-[11px] leading-none text-muted-foreground">
              {secondary}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
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
        <div className="flex items-stretch gap-3 border-b border-subtle pb-2 pt-1.5 group-last:border-b-0">
          <div className="flex w-7 shrink-0 items-center justify-center">
            <div className="h-3.5 w-3 rounded bg-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-h-5 items-center gap-2">
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
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

export const MarketRankingSlate = () => {
  const [tab, setTab] = useState<TabId>("fluctuation");
  const [direction, setDirection] = useState<Direction>("up");
  const [by, setBy] = useState<VolumeBy>("volume");
  const [market, setMarket] = useState<Market>("all");

  const kind =
    tab === "fluctuation"
      ? ({ kind: "fluctuation", direction, market } as const)
      : ({ kind: "volume", by, market } as const);

  const { items, failed, session, isLoading, isError, isPlaceholderData } =
    useMarketRanking(kind);

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
