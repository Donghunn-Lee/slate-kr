"use client";

import { type ReactNode } from "react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import {
  INDEX_LABEL,
  OVERSEAS_INDEX_DELAY_MIN,
  getIndexMeta,
  isOverseasIntradayCode,
  type DomesticIndexCode,
  type IndexCode,
  type OverseasIndexCode,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";
import { useIndexQuotes } from "@/features/index-quotes/useIndexQuotes";
import { useOverseasIndexIntraday } from "@/features/index-quotes/useOverseasIndexIntraday";
import { useOverseasIndexQuotes } from "@/features/index-quotes/useOverseasIndexQuotes";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";
import { formatOverseasQuoteTime } from "@/shared/utils/formatOverseasQuoteTime";
import { resolveOverseasDisplayState } from "@/shared/utils/resolveOverseasDisplayState";
import {
  getKrxLastCloseDate,
  getKrxSessionState,
  getKstDateAndMinutes,
  isKrxOpeningWindow,
} from "@/shared/utils/market";
import { useNow } from "@/shared/hooks/useNow";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import { cn } from "@/lib/utils";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexDetailPaneProps = {
  selected: IndexCode;
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<IndexCode, PriceStats | null>;
  volumeByIndex: Record<IndexCode, number | null>;
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
    <div className="text-micro tabular-nums sm:text-body-sm">{children}</div>
  </div>
);

type StatsBlockProps = {
  stats: PriceStats;
  isDomestic: boolean;
  volume: number | null;
  volumeAsOf: string | null;
  refDate: string | null;
};

const StatsBlock = ({
  stats,
  isDomestic,
  volume,
  volumeAsOf,
  refDate,
}: StatsBlockProps) => {
  const { range52w, returns } = stats;
  // flex-wrap 은 항목 수가 가변인 stats 행에 media-query grid 보다 견고 —
  // 넓은 pane 에선 한 줄, 좁은 pane 이나 모바일에선 자연 reflow.
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-x-6 sm:gap-y-3">
      <StatCell label="52주" className="w-full sm:w-auto">
        {range52w !== null ? (
          <div className="flex items-baseline gap-3 whitespace-nowrap font-medium">
            <span className="text-price-down">
              저 {formatIndexPrice(range52w.low)}
            </span>
            <span className="text-price-up">
              고 {formatIndexPrice(range52w.high)}
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
          <StatCell label={volumeAsOf ? `거래량 (${volumeAsOf})` : "거래량"}>
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
  const calendar = useMarketCalendar();
  const now = useNow();
  const meta = getIndexMeta(selected);
  const isDomestic = meta.region === "domestic";
  const isOverseasIntraday = isOverseasIntradayCode(selected);
  const { data, isLoading } = useIndexQuotes();
  const overseasIntradayQuery = useOverseasIndexIntraday();
  const overseasQuotesQuery = useOverseasIndexQuotes();
  const prices = dailyByIndex[selected];
  const latestDaily =
    prices && prices.length > 0 ? prices[prices.length - 1] : null;

  // 해외 intraday 지수(SPX/COMP/NDX): 최신 봉. quote 부재 시 fallback.
  const overseasBars = isOverseasIntraday
    ? overseasIntradayQuery.data?.quotes[selected as OverseasIntradayCode] ?? []
    : [];
  const overseasLatestBar =
    overseasBars.length > 0 ? overseasBars[overseasBars.length - 1] : null;
  // 해외 quote — 8종 전부 커버. 상세 헤더의 라이브 소스는 quote 우선.
  const overseasQuote = isDomestic
    ? null
    : overseasQuotesQuery.data?.quotes[selected as OverseasIndexCode] ?? null;

  // 셀 합성 규칙은 buildIndexCell 참조 (Rail·홈과 공용).
  const cell = buildIndexCell({
    isDomestic,
    name: INDEX_LABEL[selected],
    domesticCell: isDomestic
      ? data?.quotes[selected as DomesticIndexCode]
      : undefined,
    overseasQuote,
    overseasLatestBar,
    latestDaily,
    session: data?.session,
    // 개장 전 창 판정은 클라 시계 축. now=null(SSR·첫 렌더)은 false.
    openingWindow:
      now !== null && isKrxOpeningWindow(data?.session, now, calendar),
  });

  // 라벨은 request time 기준: 국내는 client clock 으로 세션 판정, 해외는 quote.time 판정.
  const isKrxRegular = isDomestic && now !== null && getKrxSessionState(now, calendar) === "regular";
  // 국내 마감 라벨 소스: pre 세션에서도 전일 반환하는 getKrxLastCloseDate 사용.
  // 종목 헤더(`stockHeaderLabel.ts`)와 동일한 MM.DD 포맷·today-vs-past 규칙을 공유.
  const domesticLastCloseDate = now ? getKrxLastCloseDate(now, calendar) : null;
  const kstToday = now ? getKstDateAndMinutes(now).date : null;
  const domesticSourceIsToday =
    domesticLastCloseDate !== null &&
    kstToday !== null &&
    domesticLastCloseDate === kstToday;
  // 장중 시각은 클라 시계가 아닌 셀 fetchedAt — 응답이 서버 캐시 히트여도 라벨이
  // 실제 시세 조립 시각을 가리키게 한다.
  const domesticFetchedAt = isDomestic
    ? data?.quotes[selected as DomesticIndexCode]?.fetchedAt ?? null
    : null;
  const domesticSourceLabel = domesticSourceIsToday
    ? "장 마감 · 15:30"
    : domesticLastCloseDate
      ? `전일 종가 · ${domesticLastCloseDate.slice(5, 7)}.${domesticLastCloseDate.slice(8, 10)}`
      : "장 마감";

  // 해외 표시 상태 판정 (live/closed/eod_only). 시각 포맷은 formatOverseasQuoteTime 재사용.
  const overseasState = !isDomestic
    ? resolveOverseasDisplayState(
        overseasQuote?.time ?? null,
        selected as OverseasIndexCode,
      )
    : null;
  const overseasKstTime =
    overseasQuote && !isDomestic
      ? formatOverseasQuoteTime(
          overseasQuote.time,
          selected as OverseasIndexCode,
        )
      : null;
  // 해외 stats 기준일 — 라이브/EOD 어느 소스든 daily 스냅샷 date 유지 (52주·수익률 계산 기준).
  const overseasRefDate = latestDaily?.date ?? null;

  const stats = statsByIndex[selected];
  const volume = isDomestic ? volumeByIndex[selected] : null;
  // 국내 거래량은 EOD 값 — 최신 봉 date 를 셀 밀도 고려해 MM-DD 로 병기.
  const domesticVolumeAsOf = isDomestic ? latestDaily?.date.slice(5) ?? null : null;

  // 해외 지수 라이브 지연 분 (미실측 = undefined → 중립 표시).
  const overseasDelayMin = !isDomestic
    ? OVERSEAS_INDEX_DELAY_MIN[selected as OverseasIndexCode]
    : undefined;
  const isOverseasLive = overseasState?.kind === "live" && overseasKstTime !== null;
  // dot = 실시간(지연 없음) live 전용. 국내 정규장 or 해외 live && delay 확정 0.
  const showDot = isKrxRegular || (isOverseasLive && overseasDelayMin === 0);
  // 지연 확정된 해외 지수만 pill 배지. 미실측(undefined)·실시간(0)·비 live 는 배지 없음.
  const showDelayBadge =
    isOverseasLive && overseasDelayMin !== undefined && overseasDelayMin > 0;
  const referenceLabel = isDomestic
    ? now === null
      ? "장 마감"
      : isKrxRegular
        ? domesticFetchedAt !== null
          ? `장중 · ${formatClock(new Date(domesticFetchedAt))}`
          : "장중"
        : domesticSourceLabel
    : overseasState?.kind === "live" && overseasKstTime
      ? `${overseasKstTime} 기준`
      : overseasState?.kind === "closed" && overseasKstTime
        ? `장 마감 · ${overseasKstTime}`
        : `전일 종가 · ${overseasRefDate ?? "—"}`;

  return (
    <StockPanel variant="lavender" className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-lavender-border/60 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-value font-medium">{INDEX_LABEL[selected]}</h2>
          <span className="text-value font-medium text-muted-foreground/80">
            {meta.overline}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          {/* emerald dot 은 실시간(지연 0) live 전용. 지연 지수는 pill 배지로 신호. */}
          {showDot && (
            <span
              className="inline-block size-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
          )}
          <span>{referenceLabel}</span>
          {showDelayBadge && (
            <span
              className="ml-1 rounded-sm border border-subtle bg-elevated px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-muted-foreground"
              aria-label={`약 ${overseasDelayMin}분 지연 시세`}
            >
              지연 ~{overseasDelayMin}분
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div>
          {isDomestic && isLoading && !cell ? (
            <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          ) : cell?.live ? (
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-headline font-semibold tabular-nums">
                <PriceCountUp key={selected} value={cell.live.price} />
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
          <div className="mt-1 flex items-baseline gap-1.5 sm:hidden">
            <span className="text-micro font-medium uppercase tracking-widest text-muted-foreground">
              {domesticVolumeAsOf ? `거래량 (${domesticVolumeAsOf})` : "거래량"}
            </span>
            <span className="text-micro tabular-nums">
              {volume.toLocaleString("ko-KR")}
            </span>
          </div>
        )}

        {stats && (
          <div className="mt-2 sm:mt-5">
            <StatsBlock
              stats={stats}
              isDomestic={isDomestic}
              volume={volume}
              volumeAsOf={domesticVolumeAsOf}
              refDate={overseasRefDate}
            />
          </div>
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
