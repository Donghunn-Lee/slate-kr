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
import {
  getKrxLastCloseDate,
  getKrxSessionState,
  getKstDateAndMinutes,
} from "@/shared/utils/market";
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

// 매 분 tick 하는 client clock. null = pre-mount (SSR hydration mismatch 회피).
// 장 상태와 무관하게 항상 tick — 15:30·09:00 세션 경계 넘을 때 라벨이 자동 갱신되어야 함.
const useNow = (): Date | null => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);
  return now;
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
  // flex-wrap 은 항목 수가 가변인 stats 행에 media-query grid 보다 견고 —
  // 넓은 pane 에선 한 줄, 좁은 pane 이나 모바일에선 자연 reflow.
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <StatCell label="52주">
        {range52w !== null ? (
          <div className="flex items-baseline gap-3 whitespace-nowrap">
            <span>
              <span className="text-muted-foreground/70">저 </span>
              {formatIndexPrice(range52w.low)}
            </span>
            <span>
              <span className="text-muted-foreground/70">고 </span>
              {formatIndexPrice(range52w.high)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </StatCell>
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

  // 라벨은 request time 기준: 국내는 client clock 으로 세션·기준일을 도출한다
  // (KIS live/intraday 가 오늘치를 이미 그리고 있으므로 라벨도 오늘·현재 시각을 반영).
  // 해외는 실시간 소스 없음 → DB 최신 EOD 기준일 유지.
  const now = useNow();
  const isRegular = isDomestic && now !== null && getKrxSessionState(now) === "regular";
  const domesticDate = now
    ? isRegular
      ? getKstDateAndMinutes(now).date
      : getKrxLastCloseDate(now)
    : null;
  const overseasDate = latestDaily?.date ?? null;

  const stats = statsByIndex[selected];
  const volume = isDomestic ? volumeByIndex[selected] : null;

  const referenceLabel = isDomestic
    ? now === null
      ? "정규장 마감"
      : isRegular
        ? `실시간 · ${domesticDate} ${formatClock(now)}`
        : `정규장 마감 · ${domesticDate} 15:30`
    : `미국 · 정규장 마감${overseasDate ? ` · 기준일 ${overseasDate}` : ""}`;

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
          {isRegular && (
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
            refDate={overseasDate}
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
