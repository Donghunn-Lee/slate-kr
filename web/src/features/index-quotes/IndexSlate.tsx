"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexMiniChart } from "@/entities/index/IndexMiniChart";
import { toIndexDisplayBars } from "@/entities/index/toIndexDisplayBars";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  PriceSign,
} from "@/shared/types/quote";
import {
  DOMESTIC_INDEX_CODES,
  INDEX_LABEL,
  type DomesticIndexCode,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import { INDEX_MINI_INTERVAL_MIN } from "@/shared/constants/chart";
import { useNow } from "@/shared/hooks/useNow";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import {
  getKrxLastCloseDate,
  getKstDateAndMinutes,
  isKrxBeforeMarketOpen,
} from "@/shared/utils/market";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";
import { cn } from "@/lib/utils";
import { useIndexQuotes, type IndexCellData } from "./useIndexQuotes";
import { useIndexIntraday } from "./useIndexIntraday";
import { MiniIndexCell, MiniIndexCellSkeleton } from "./MiniIndexCell";
import { OverseasIndexList } from "./OverseasIndexList";

// 가격 span 등락색. flat 은 default foreground 유지 (색 없음) — 무채로 두어
// "값 색상은 상승/하락 유의 신호" 인 의미를 보존.
const PRICE_SIGN_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "",
};

const signOfChange = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

// 국내 지수 값 포맷 — KRW 소수점 없이 콤마.
const formatKrw = (v: number): string => v.toLocaleString("ko-KR");

// 국내 live 값 렌더 — 카운트업 애니메이션. 해외는 별도 리스트에서 애니 없이 텍스트로 렌더.
const renderDomesticLive = (price: number): ReactNode => (
  <PriceCountUp value={price} />
);

type IndexSlateProps = {
  overseasSnapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: ChartBar[];
  prevClose: number | null;
  intradayFailed: boolean;
  intradayLoading: boolean;
  isPreopen: boolean;
};

const IndexCell = ({ label, cell, bars, prevClose, intradayFailed, intradayLoading, isPreopen }: IndexCellProps) => (
  <div className="flex flex-col gap-2 px-4 py-3 md:gap-3 md:px-6 md:py-4">
    <div>
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      {cell.live ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums md:text-headline md:font-medium",
              PRICE_SIGN_CLASS[cell.live.sign],
            )}
          >
            <PriceCountUp value={cell.live.price} />
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro md:text-body-sm md:font-normal"
          />
        </div>
      ) : cell.fallback ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums md:text-headline md:font-medium",
              PRICE_SIGN_CLASS[signOfChange(cell.fallback.change)],
            )}
          >
            {formatKrw(cell.fallback.close)}
          </span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro md:text-body-sm md:font-normal"
          />
          <span className="text-micro text-muted-foreground">직전 거래일</span>
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-value font-semibold tabular-nums text-muted-foreground md:text-headline md:font-medium">—</span>
          <span className="text-body-sm text-muted-foreground">데이터 없음</span>
        </div>
      )}
    </div>
    <IndexMiniChart bars={bars} prevClose={prevClose} failed={intradayFailed} isLoading={intradayLoading} isPreopen={isPreopen} />
  </div>
);

const CellSkeleton = ({ label }: { label: string }) => (
  <div className="px-4 py-3 md:px-6 md:py-4">
    <div className="text-body font-bold text-muted-foreground">{label}</div>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
  </div>
);

// 데스크톱 좌측 국내 영역 스켈레톤. 2열 페어(큰 셀 + 미니 셀 수직 스택) × 2.
// 로드 완료 그리드와 동일한 md:h-full · md:grid-rows-1 로 로딩→로드 전환 시 세로 점프 방지.
const DesktopDomesticSkeleton = () => (
  <div className="grid grid-cols-2 divide-x divide-border/60 md:h-full md:grid-rows-1">
    <div className="flex flex-col divide-y divide-border/60">
      <CellSkeleton label={INDEX_LABEL.KOSPI} />
      <MiniIndexCellSkeleton label={INDEX_LABEL.KOSPI200} />
    </div>
    <div className="flex flex-col divide-y divide-border/60">
      <CellSkeleton label={INDEX_LABEL.KOSDAQ} />
      <MiniIndexCellSkeleton label={INDEX_LABEL.KOSDAQ150} />
    </div>
  </div>
);

// 모바일 2×2 페어 그리드 전용 스켈레톤 — 대형 셀 2 + 미니 셀 2.
const MobilePairSkeleton = () => (
  <div className="divide-y divide-border/60 md:hidden">
    <div className="grid grid-cols-2 divide-x divide-border/60">
      <CellSkeleton label={INDEX_LABEL.KOSPI} />
      <CellSkeleton label={INDEX_LABEL.KOSDAQ} />
    </div>
    <div className="grid grid-cols-2 divide-x divide-border/60">
      <MiniIndexCellSkeleton label={INDEX_LABEL.KOSPI200} />
      <MiniIndexCellSkeleton label={INDEX_LABEL.KOSDAQ150} />
    </div>
  </div>
);

const formatClock = (d: Date): string =>
  d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// 마감 라벨 기준일: quote live 존재 시 셀 값은 당일 종가 → 오늘 거래일(getKrxLastCloseDate).
// live 없이 EOD fallback 으로 강등된 경우엔 셀 값 자체가 전일 → fallback.date 유지.
// (마감 직후~EOD 적재 전 구간에서 셀 값/기준일 불일치 회피.)
// 라벨 규칙: 표시 값이 당일 세션 값이면 `장 마감 · 15:30`, 다른 날이면 `전일 종가 · MM.DD`.
// 개장 전 창(pre/preopen)은 `개장 전 · [source]` 로 상태 접두어 부착. 종목 헤더
// (`stockHeaderLabel.ts`) 와 MM.DD 포맷 통일.
const MarketStatus = ({
  marketOpen,
  beforeOpen,
  hasLive,
  fallbackDate,
}: {
  marketOpen: boolean;
  beforeOpen: boolean;
  hasLive: boolean;
  fallbackDate?: string;
}) => {
  const now = useNow();
  const calendar = useMarketCalendar();
  const referenceDate = hasLive && now ? getKrxLastCloseDate(now, calendar) : fallbackDate;
  if (marketOpen) {
    return (
      <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
        <span>실시간{now ? ` · ${formatClock(now)}` : ""}</span>
      </div>
    );
  }
  const kstToday = now ? getKstDateAndMinutes(now).date : null;
  const sourceIsToday =
    referenceDate !== undefined && kstToday !== null && referenceDate === kstToday;
  const sourceLabel = sourceIsToday
    ? "장 마감 · 15:30"
    : referenceDate
      ? `전일 종가 · ${referenceDate.slice(5, 7)}.${referenceDate.slice(8, 10)}`
      : null;
  const text = beforeOpen
    ? sourceLabel
      ? `개장 전 · ${sourceLabel}`
      : "개장 전"
    : sourceLabel ?? "장 마감";
  return <div className="text-body-sm text-muted-foreground">{text}</div>;
};

const EMPTY_BARS: ChartBar[] = [];

type DomesticDisplay = { bars: ChartBar[]; prevClose: number | null };

// snapshot 첫 봉의 `close - change` 로 prevClose 를 유도. 리샘플 후엔 close 가
// 버킷 마지막 값으로 바뀌므로 반드시 raw snapshot 에서 뽑는다.
const derivePrevClose = (
  snapshots: IndexIntradaySnapshot[] | undefined,
): number | null => {
  if (!snapshots || snapshots.length === 0) return null;
  const first = snapshots[0];
  const pc = first.close - first.change;
  return pc > 0 ? pc : null;
};

export const IndexSlate = ({ overseasSnapshotsByCode }: IndexSlateProps) => {
  const { data, isLoading, isError } = useIndexQuotes();
  const { data: intraday, isLoading: intradayLoading } = useIndexIntraday();
  // 국내 개장 전(pre · preopen). intraday 서버가 [] 를 돌려주므로 미니차트 empty
  // 문구를 "장중 데이터 없음" 대신 "개장 전" 으로 대체하고 헤더 라벨도 3-state 로 확장.
  const beforeOpen = isKrxBeforeMarketOpen(data?.session);

  const displayByCode = useMemo<Record<DomesticIndexCode, DomesticDisplay>>(() => {
    const out = {} as Record<DomesticIndexCode, DomesticDisplay>;
    for (const code of DOMESTIC_INDEX_CODES) {
      const snaps = intraday?.quotes[code];
      out[code] = {
        bars: snaps ? toIndexDisplayBars(snaps, INDEX_MINI_INTERVAL_MIN, code) : EMPTY_BARS,
        prevClose: derivePrevClose(snaps),
      };
    }
    return out;
  }, [intraday]);

  // pre/preopen 창의 등락 스왑을 /indices 표면과 동일하게 buildIndexCell 로 통과 —
  // 홈과 상세 표면이 같은 셀 규칙을 공유하도록 한다.
  const cellByCode = useMemo<Record<DomesticIndexCode, IndexCellData | undefined> | null>(() => {
    if (!data) return null;
    const out = {} as Record<DomesticIndexCode, IndexCellData | undefined>;
    for (const code of DOMESTIC_INDEX_CODES) {
      out[code] = buildIndexCell({
        isDomestic: true,
        name: INDEX_LABEL[code],
        domesticCell: data.quotes[code],
        overseasLatestBar: null,
        latestDaily: null,
        session: data.session,
      });
    }
    return out;
  }, [data]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-end gap-3">
          <h2 className="text-value font-semibold text-foreground">주요 지수</h2>
          {data ? (
            <MarketStatus
              marketOpen={data.marketOpen}
              beforeOpen={beforeOpen}
              hasLive={data.quotes.KOSPI.live !== null}
              fallbackDate={data.quotes.KOSPI.fallback?.date}
            />
          ) : null}
        </div>
        <Link
          href="/stocks/indices"
          className="flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <StockPanel className="p-0">
        {/* 데스크톱: 좌우 2영역 (국내 2fr : 해외 1fr).
            outer grid 는 row-stretch(default) 로 좌 2fr 을 우 1fr(해외 리스트) 높이에 맞춘다.
            좌열 그리드 체인(2fr div → inner grid → 각 col flex-col) 에 md:h-full · md:grid-rows-1
            로 높이를 전달해야 MiniIndexCell 의 md:flex-1 이 실제 grow 공간을 확보한다. */}
        <div className="hidden md:grid md:grid-cols-[2fr_1fr] md:divide-x md:divide-border/60">
          <div className="md:h-full">
            {isError && !data ? (
              <div className="px-6 py-6 text-body text-muted-foreground">
                지수 시세를 불러오지 못했습니다
              </div>
            ) : isLoading || !data ? (
              <DesktopDomesticSkeleton />
            ) : (
              <div className="grid grid-cols-2 divide-x divide-border/60 md:h-full md:grid-rows-1">
                <div className="flex flex-col divide-y divide-border/60">
                  <IndexCell
                    label={INDEX_LABEL.KOSPI}
                    cell={cellByCode?.KOSPI ?? data.quotes.KOSPI}
                    bars={displayByCode.KOSPI.bars}
                    prevClose={displayByCode.KOSPI.prevClose}
                    intradayFailed={intraday?.failed.KOSPI ?? false}
                    intradayLoading={intradayLoading}
                    isPreopen={beforeOpen}
                  />
                  <MiniIndexCell
                    label={INDEX_LABEL.KOSPI200}
                    cell={cellByCode?.KOSPI200 ?? data.quotes.KOSPI200}
                    bars={displayByCode.KOSPI200.bars}
                    prevClose={displayByCode.KOSPI200.prevClose}
                    intradayFailed={intraday?.failed.KOSPI200 ?? false}
                    formatPrice={formatKrw}
                    renderLiveValue={renderDomesticLive}
                    priceClassName="md:text-xl md:font-medium"
                  />
                </div>
                <div className="flex flex-col divide-y divide-border/60">
                  <IndexCell
                    label={INDEX_LABEL.KOSDAQ}
                    cell={cellByCode?.KOSDAQ ?? data.quotes.KOSDAQ}
                    bars={displayByCode.KOSDAQ.bars}
                    prevClose={displayByCode.KOSDAQ.prevClose}
                    intradayFailed={intraday?.failed.KOSDAQ ?? false}
                    intradayLoading={intradayLoading}
                    isPreopen={beforeOpen}
                  />
                  <MiniIndexCell
                    label={INDEX_LABEL.KOSDAQ150}
                    cell={cellByCode?.KOSDAQ150 ?? data.quotes.KOSDAQ150}
                    bars={displayByCode.KOSDAQ150.bars}
                    prevClose={displayByCode.KOSDAQ150.prevClose}
                    intradayFailed={intraday?.failed.KOSDAQ150 ?? false}
                    formatPrice={formatKrw}
                    renderLiveValue={renderDomesticLive}
                    priceClassName="md:text-xl md:font-medium"
                  />
                </div>
              </div>
            )}
          </div>
          <OverseasIndexList snapshotsByCode={overseasSnapshotsByCode} />
        </div>
        {/* 모바일·태블릿(<md): 국내 2×2 페어 유지, 해외 리스트 하단 스택. */}
        <div className="divide-y divide-border/60 md:hidden">
          {isError && !data ? (
            <div className="px-6 py-6 text-body text-muted-foreground">
              지수 시세를 불러오지 못했습니다
            </div>
          ) : isLoading || !data ? (
            <MobilePairSkeleton />
          ) : (
            <div className="divide-y divide-border/60">
              <div className="grid grid-cols-2 divide-x divide-border/60">
                <IndexCell
                  label={INDEX_LABEL.KOSPI}
                  cell={cellByCode?.KOSPI ?? data.quotes.KOSPI}
                  bars={displayByCode.KOSPI.bars}
                  prevClose={displayByCode.KOSPI.prevClose}
                  intradayFailed={intraday?.failed.KOSPI ?? false}
                  intradayLoading={intradayLoading}
                  isPreopen={beforeOpen}
                />
                <IndexCell
                  label={INDEX_LABEL.KOSDAQ}
                  cell={cellByCode?.KOSDAQ ?? data.quotes.KOSDAQ}
                  bars={displayByCode.KOSDAQ.bars}
                  prevClose={displayByCode.KOSDAQ.prevClose}
                  intradayFailed={intraday?.failed.KOSDAQ ?? false}
                  intradayLoading={intradayLoading}
                  isPreopen={beforeOpen}
                />
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/60">
                <MiniIndexCell
                  label={INDEX_LABEL.KOSPI200}
                  cell={cellByCode?.KOSPI200 ?? data.quotes.KOSPI200}
                  bars={displayByCode.KOSPI200.bars}
                  prevClose={displayByCode.KOSPI200.prevClose}
                  intradayFailed={intraday?.failed.KOSPI200 ?? false}
                  formatPrice={formatKrw}
                  renderLiveValue={renderDomesticLive}
                  priceClassName="md:text-xl md:font-medium"
                />
                <MiniIndexCell
                  label={INDEX_LABEL.KOSDAQ150}
                  cell={cellByCode?.KOSDAQ150 ?? data.quotes.KOSDAQ150}
                  bars={displayByCode.KOSDAQ150.bars}
                  prevClose={displayByCode.KOSDAQ150.prevClose}
                  intradayFailed={intraday?.failed.KOSDAQ150 ?? false}
                  formatPrice={formatKrw}
                  renderLiveValue={renderDomesticLive}
                  priceClassName="md:text-xl md:font-medium"
                />
              </div>
            </div>
          )}
          <OverseasIndexList
            snapshotsByCode={overseasSnapshotsByCode}
            twoColumnStacked
          />
        </div>
      </StockPanel>
    </section>
  );
};
