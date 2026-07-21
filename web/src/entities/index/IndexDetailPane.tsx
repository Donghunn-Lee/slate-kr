"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import {
  INDEX_LABEL,
  getIndexMeta,
  type DomesticIndexCode,
  type IndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";
import {
  useIndexQuotes,
  type IndexCellData,
} from "@/features/index-quotes/useIndexQuotes";
import { cn } from "@/lib/utils";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexDetailPaneProps = {
  selected: IndexCode;
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<IndexCode, PriceStats | null>;
  volumeByIndex: Record<IndexCode, number | null>;
};

const CELL_KEY: Record<
  DomesticIndexCode,
  "kospi" | "kosdaq" | "kospi200" | "kosdaq150"
> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KOSPI200: "kospi200",
  KOSDAQ150: "kosdaq150",
};

const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

const formatIndexVolume = (v: number): string => {
  const eok = v / 100_000_000;
  if (eok >= 1) return `${eok.toFixed(1)}억`;
  const man = v / 10_000;
  if (man >= 1) return `${Math.round(man).toLocaleString("ko-KR")}만`;
  return v.toLocaleString("ko-KR");
};

const formatReturn = (v: number): string => {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
};

const returnColorClass = (v: number | null): string => {
  if (v === null) return "text-muted-foreground";
  if (v > 0) return "text-price-up";
  if (v < 0) return "text-price-down";
  return "text-price-neutral";
};

const formatClock = (d: Date): string =>
  d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// 장중일 때만 다음 분 경계에 맞춰 tick — 폴링과 무관하게 시각 라벨을 최신화한다.
// enabled=false 이면 시계는 정지(마지막 값 유지). 렌더 측에서 조건부로만 표시.
const useLiveMinute = (enabled: boolean): string => {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      setNow(new Date());
      intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [enabled]);
  return formatClock(now);
};

type StatCellProps = {
  label: string;
  children: ReactNode;
};

const StatCell = ({ label, children }: StatCellProps) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
    <div className="text-sm tabular-nums">{children}</div>
  </div>
);

type StatsBlockProps = {
  stats: PriceStats;
  isDomestic: boolean;
  volume: number | null;
  refDate: string | null;
};

const StatsBlock = ({ stats, isDomestic, volume, refDate }: StatsBlockProps) => {
  const { range52w, returns } = stats;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-5">
      {range52w !== null ? (
        <StatCell label="52주 저-고">
          <span>
            {formatIndexPrice(range52w.low)}
            <span className="mx-1 text-muted-foreground/60">–</span>
            {formatIndexPrice(range52w.high)}
          </span>
        </StatCell>
      ) : (
        <StatCell label="52주 저-고">
          <span className="text-muted-foreground">—</span>
        </StatCell>
      )}
      {returns.map(({ period, value }) => (
        <StatCell key={period} label={period}>
          <span className={cn("font-medium", returnColorClass(value))}>
            {value === null ? "—" : formatReturn(value)}
          </span>
        </StatCell>
      ))}
      {isDomestic ? (
        <StatCell label="거래량">
          {volume !== null ? (
            formatIndexVolume(volume)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </StatCell>
      ) : (
        <StatCell label="기준일">
          {refDate ?? <span className="text-muted-foreground">—</span>}
        </StatCell>
      )}
    </div>
  );
};

export const IndexDetailPane = ({
  selected,
  dailyByIndex,
  statsByIndex,
  volumeByIndex,
}: IndexDetailPaneProps) => {
  const meta = getIndexMeta(selected);
  const isDomestic = meta.region === "domestic";
  const { data, isLoading } = useIndexQuotes();
  const prices = dailyByIndex[selected];
  const latestDaily =
    prices && prices.length > 0 ? prices[prices.length - 1] : null;
  // 국내: 실시간 quote (없으면 서비스가 직전 EOD 로 fallback 채워줌).
  // 해외: 실시간 없음 → 최신 EOD 봉으로 fallback 합성 (change/changeRate 는 collector 계산).
  const cell: IndexCellData | undefined = isDomestic
    ? data?.quotes[CELL_KEY[selected as DomesticIndexCode]]
    : latestDaily
      ? { live: null, fallback: latestDaily }
      : undefined;
  const marketOpen = isDomestic ? (data?.marketOpen ?? false) : false;
  const clock = useLiveMinute(marketOpen);
  // 국내 fallback 은 quote 서비스가 넣어준 직전 EOD 날짜, 없으면 우리가 fetch 한
  // latestDaily.date. 해외는 항상 latestDaily.date.
  const refDate = isDomestic
    ? (cell?.fallback?.date ?? latestDaily?.date ?? null)
    : (latestDaily?.date ?? null);

  const stats = statsByIndex[selected];
  const volume = isDomestic ? volumeByIndex[selected] : null;

  const referenceLabel = marketOpen
    ? `실시간 · ${clock}`
    : isDomestic
      ? `정규장 마감${refDate ? ` · 기준일 ${refDate}` : ""}`
      : `미국 · 정규장 마감${refDate ? ` · 기준일 ${refDate}` : ""}`;

  return (
    <StockPanel variant="lavender" className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-lavender-border/60 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {meta.overline}
          </span>
          <h2 className="text-lg font-medium">{INDEX_LABEL[selected]}</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {marketOpen && (
            <span
              className="inline-block size-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
          )}
          <span>{referenceLabel}</span>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div>
          {isDomestic && isLoading && !cell ? (
            <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          ) : cell?.live ? (
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums">
                <PriceCountUp from={cell.live.price} to={cell.live.price} />
              </span>
              <PriceChange
                change={cell.live.change}
                changeRate={cell.live.changeRate}
                sign={cell.live.sign}
                symbol="arrow"
                size="sm"
              />
            </div>
          ) : cell?.fallback ? (
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums">
                {formatIndexPrice(cell.fallback.close)}
              </span>
              <PriceChange
                change={cell.fallback.change}
                changeRate={cell.fallback.changeRate}
                symbol="arrow"
                size="sm"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">데이터 없음</p>
          )}
        </div>

        {stats && (
          <StatsBlock
            stats={stats}
            isDomestic={isDomestic}
            volume={volume}
            refDate={refDate}
          />
        )}
      </div>

      <div className="px-6 pb-6">
        {prices !== null && prices !== undefined ? (
          <IndexChartDynamic
            indexCode={selected}
            prices={prices}
            intradayEnabled={isDomestic}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            차트 데이터를 불러오지 못했습니다
          </p>
        )}
      </div>
    </StockPanel>
  );
};
