"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import {
  INDEX_LABEL,
  getIndexMeta,
  isOverseasIntradayCode,
  type DomesticIndexCode,
  type IndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import { useOverseasIndexIntraday } from "@/features/index-quotes/useOverseasIndexIntraday";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";
import {
  getKrxLastCloseDate,
  getKrxSessionState,
  getKstDateAndMinutes,
  getUsSessionState,
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

const OVERSEAS_CELL_KEY: Record<"SPX" | "COMP" | "NDX", "spx" | "comp" | "ndx"> = {
  SPX: "spx",
  COMP: "comp",
  NDX: "ndx",
};

// fake-UTC 초 → 시각 라벨 "HH:MM" (ET). 인코딩 대칭 — Date.UTC 로 위장했으므로
// getUTC* 가 원래 ET 컴포넌트를 돌려준다.
const formatEtClock = (sec: number): string => {
  const d = new Date(sec * 1000);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const formatEtDate = (sec: number): string => {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
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
  className?: string;
};

const StatCell = ({ label, children, className }: StatCellProps) => (
  <div
    className={cn(
      "flex flex-row items-baseline gap-1.5 sm:flex-col sm:gap-0.5",
      className,
    )}
  >
    <span className="text-micro font-medium uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
    <div className="text-body-sm tabular-nums">{children}</div>
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
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:gap-x-6 sm:gap-y-3">
      <StatCell label="52주" className="w-full sm:w-auto">
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
      {/* 모바일에선 거래량/기준일 셀 숨김:
          국내 거래량은 가격 블록 아래 풀 숫자 행으로 이관, 해외 기준일은 헤더
          referenceLabel 이 이미 노출하므로 중복. sm:contents 로 데스크톱 flex-wrap
          참여를 유지. */}
      {isDomestic ? (
        <div className="hidden sm:contents">
          <StatCell label="거래량">
            {volume !== null ? (
              formatIndexVolume(volume)
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </StatCell>
        </div>
      ) : (
        <div className="hidden sm:contents">
          <StatCell label="기준일">
            {refDate ?? <span className="text-muted-foreground">—</span>}
          </StatCell>
        </div>
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
  const isOverseasIntraday = isOverseasIntradayCode(selected);
  const { data, isLoading } = useIndexQuotes();
  const overseasIntradayQuery = useOverseasIndexIntraday();
  const prices = dailyByIndex[selected];
  const latestDaily =
    prices && prices.length > 0 ? prices[prices.length - 1] : null;

  // 해외 intraday 지수(SPX/COMP/NDX): 최신 봉으로 라이브 셀 파생. NULL 이면 EOD fallback.
  const overseasBars = isOverseasIntraday
    ? overseasIntradayQuery.data?.quotes[
        OVERSEAS_CELL_KEY[selected as "SPX" | "COMP" | "NDX"]
      ] ?? []
    : [];
  const overseasLatestBar =
    overseasBars.length > 0 ? overseasBars[overseasBars.length - 1] : null;

  // 셀 합성 규칙은 buildIndexCell 참조 (Rail·홈과 공용).
  const cell = buildIndexCell({
    isDomestic,
    name: INDEX_LABEL[selected],
    domesticCell: isDomestic
      ? data?.quotes[CELL_KEY[selected as DomesticIndexCode]]
      : undefined,
    overseasLatestBar,
    latestDaily,
  });

  // 라벨은 request time 기준: 국내/해외 모두 client clock 으로 세션·기준일 도출.
  const now = useNow();
  const isKrxRegular = isDomestic && now !== null && getKrxSessionState(now) === "regular";
  const isUsRegular =
    isOverseasIntraday && now !== null && getUsSessionState(now) === "regular";
  const domesticDate = now
    ? isKrxRegular
      ? getKstDateAndMinutes(now).date
      : getKrxLastCloseDate(now)
    : null;
  // 해외 라벨 시각: client clock 대신 최신 봉의 ET 시각 (~15분 지연 피드가 언제까지
  // 들어왔는지 정직히 노출).
  const overseasLatestClock = overseasLatestBar
    ? formatEtClock(overseasLatestBar.timestamp)
    : null;
  const overseasLatestDate = overseasLatestBar
    ? formatEtDate(overseasLatestBar.timestamp)
    : latestDaily?.date ?? null;

  const stats = statsByIndex[selected];
  const volume = isDomestic ? volumeByIndex[selected] : null;

  const referenceLabel = isDomestic
    ? now === null
      ? "정규장 마감"
      : isKrxRegular
        ? `실시간 · ${domesticDate} ${formatClock(now)}`
        : `정규장 마감 · ${domesticDate} 15:30`
    : isOverseasIntraday
      ? isUsRegular
        ? `미국 · ~15분 지연${overseasLatestDate && overseasLatestClock ? ` · ${overseasLatestDate} ${overseasLatestClock} ET` : ""}`
        : `미국 · 정규장 마감${overseasLatestDate ? ` · 기준일 ${overseasLatestDate}` : ""}`
      : `미국 · 정규장 마감${latestDaily?.date ? ` · 기준일 ${latestDaily.date}` : ""}`;

  return (
    <StockPanel variant="lavender" className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-lavender-border/60 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-caption font-medium uppercase tracking-widest text-muted-foreground">
            {meta.overline}
          </span>
          <h2 className="text-value font-medium">{INDEX_LABEL[selected]}</h2>
        </div>
        <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          {(isKrxRegular || isUsRegular) && (
            <span
              className="inline-block size-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
          )}
          <span>{referenceLabel}</span>
          {isUsRegular && (
            <span
              className="ml-1 rounded-sm border border-subtle bg-elevated px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-muted-foreground"
              aria-label="약 15분 지연 시세"
            >
              지연
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
        <div>
          {isDomestic && isLoading && !cell ? (
            <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          ) : cell?.live ? (
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-headline font-semibold tabular-nums">
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
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-headline font-semibold tabular-nums">
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
            <p className="text-body text-muted-foreground">데이터 없음</p>
          )}
        </div>

        {/* 모바일 전용 거래량 풀 숫자 행. 스탯 열의 "2.8억" 축약과 달리 raw
            volume.toLocaleString() 그대로 노출 — 정보량 손실 없이 헤더 직후 위치.
            데스크톱은 StatsBlock 의 축약값이 담당 → 여기선 미렌더. */}
        {isDomestic && volume !== null && (
          <div className="flex items-baseline gap-1.5 sm:hidden">
            <span className="text-micro font-medium uppercase tracking-widest text-muted-foreground">
              거래량
            </span>
            <span className="text-micro tabular-nums">
              {volume.toLocaleString("ko-KR")}
            </span>
          </div>
        )}

        {stats && (
          <StatsBlock
            stats={stats}
            isDomestic={isDomestic}
            volume={volume}
            refDate={overseasLatestDate}
          />
        )}
      </div>

      <div className="px-6 pb-6">
        {prices !== null && prices !== undefined ? (
          <IndexChartDynamic
            indexCode={selected}
            prices={prices}
            intradayEnabled={isDomestic || isOverseasIntraday}
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
