"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexMiniChart } from "@/entities/index/IndexMiniChart";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  PriceSign,
} from "@/shared/types/quote";
import type { OverseasIndexCode } from "@/shared/constants/indices";
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
  <PriceCountUp from={price} to={price} />
);

type IndexSlateProps = {
  overseasSnapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
};

const IndexCell = ({ label, cell, bars, intradayFailed }: IndexCellProps) => (
  <div className="flex flex-col gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
    <div>
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      {cell.live ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums sm:text-headline sm:font-medium",
              PRICE_SIGN_CLASS[cell.live.sign],
            )}
          >
            <PriceCountUp from={cell.live.price} to={cell.live.price} />
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro sm:text-body-sm sm:font-normal"
          />
        </div>
      ) : cell.fallback ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums sm:text-headline sm:font-medium",
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
            className="text-micro sm:text-body-sm sm:font-normal"
          />
          <span className="text-micro text-muted-foreground">직전 거래일</span>
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-value font-semibold tabular-nums text-muted-foreground sm:text-headline sm:font-medium">—</span>
          <span className="text-body-sm text-muted-foreground">데이터 없음</span>
        </div>
      )}
    </div>
    <IndexMiniChart bars={bars} failed={intradayFailed} />
  </div>
);

const CellSkeleton = ({ label }: { label: string }) => (
  <div className="px-4 py-3 sm:px-6 sm:py-4">
    <div className="text-body font-bold text-muted-foreground">{label}</div>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
  </div>
);

// 데스크톱 좌측 국내 영역 스켈레톤. 2열 페어(큰 셀 + 미니 셀 수직 스택) × 2.
const DesktopDomesticSkeleton = () => (
  <div className="grid grid-cols-2 divide-x divide-border/60">
    <div className="flex flex-col divide-y divide-border/60">
      <CellSkeleton label="코스피" />
      <MiniIndexCellSkeleton label="코스피200" />
    </div>
    <div className="flex flex-col divide-y divide-border/60">
      <CellSkeleton label="코스닥" />
      <MiniIndexCellSkeleton label="코스닥150" />
    </div>
  </div>
);

// 모바일 2×2 페어 그리드 전용 스켈레톤 — 대형 셀 2 + 미니 셀 2.
const MobilePairSkeleton = () => (
  <div className="divide-y divide-border/60 sm:hidden">
    <div className="grid grid-cols-2 divide-x divide-border/60">
      <CellSkeleton label="코스피" />
      <CellSkeleton label="코스닥" />
    </div>
    <div className="grid grid-cols-2 divide-x divide-border/60">
      <MiniIndexCellSkeleton label="코스피200" />
      <MiniIndexCellSkeleton label="코스닥150" />
    </div>
  </div>
);

const MarketStatus = ({ marketOpen, date }: { marketOpen: boolean; date?: string }) =>
  marketOpen ? (
    <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
      실시간
    </div>
  ) : (
    <div className="text-body-sm text-muted-foreground">
      15:30 장 마감{date ? ` · 기준일 ${date}` : ""}
    </div>
  );

const EMPTY_BARS: IndexIntradaySnapshot[] = [];

export const IndexSlate = ({ overseasSnapshotsByCode }: IndexSlateProps) => {
  const { data, isLoading, isError } = useIndexQuotes();
  const { data: intraday } = useIndexIntraday();

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-end gap-3">
          <h2 className="text-value font-semibold text-foreground">주요 지수</h2>
          {data ? (
            <MarketStatus
              marketOpen={data.marketOpen}
              date={data.quotes.kospi.fallback?.date}
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
        {/* 데스크톱: 좌우 2영역 (국내 2fr : 해외 1fr). */}
        <div className="hidden sm:grid sm:grid-cols-[2fr_1fr] sm:divide-x sm:divide-border/60">
          <div>
            {isError && !data ? (
              <div className="px-6 py-6 text-body text-muted-foreground">
                지수 시세를 불러오지 못했습니다
              </div>
            ) : isLoading || !data ? (
              <DesktopDomesticSkeleton />
            ) : (
              <div className="grid grid-cols-2 divide-x divide-border/60">
                <div className="flex flex-col divide-y divide-border/60">
                  <IndexCell
                    label="코스피"
                    cell={data.quotes.kospi}
                    bars={intraday?.quotes.kospi ?? EMPTY_BARS}
                    intradayFailed={intraday?.failed.kospi ?? false}
                  />
                  <MiniIndexCell
                    label="코스피200"
                    cell={data.quotes.kospi200}
                    bars={intraday?.quotes.kospi200 ?? EMPTY_BARS}
                    intradayFailed={intraday?.failed.kospi200 ?? false}
                    formatPrice={formatKrw}
                    renderLiveValue={renderDomesticLive}
                    priceClassName="sm:text-xl sm:font-medium"
                  />
                </div>
                <div className="flex flex-col divide-y divide-border/60">
                  <IndexCell
                    label="코스닥"
                    cell={data.quotes.kosdaq}
                    bars={intraday?.quotes.kosdaq ?? EMPTY_BARS}
                    intradayFailed={intraday?.failed.kosdaq ?? false}
                  />
                  <MiniIndexCell
                    label="코스닥150"
                    cell={data.quotes.kosdaq150}
                    bars={intraday?.quotes.kosdaq150 ?? EMPTY_BARS}
                    intradayFailed={intraday?.failed.kosdaq150 ?? false}
                    formatPrice={formatKrw}
                    renderLiveValue={renderDomesticLive}
                    priceClassName="sm:text-xl sm:font-medium"
                  />
                </div>
              </div>
            )}
          </div>
          <OverseasIndexList snapshotsByCode={overseasSnapshotsByCode} />
        </div>
        {/* 모바일: 국내 2×2 페어 유지, 해외 리스트 하단 스택. */}
        <div className="divide-y divide-border/60 sm:hidden">
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
                  label="코스피"
                  cell={data.quotes.kospi}
                  bars={intraday?.quotes.kospi ?? EMPTY_BARS}
                  intradayFailed={intraday?.failed.kospi ?? false}
                />
                <IndexCell
                  label="코스닥"
                  cell={data.quotes.kosdaq}
                  bars={intraday?.quotes.kosdaq ?? EMPTY_BARS}
                  intradayFailed={intraday?.failed.kosdaq ?? false}
                />
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/60">
                <MiniIndexCell
                  label="코스피200"
                  cell={data.quotes.kospi200}
                  bars={intraday?.quotes.kospi200 ?? EMPTY_BARS}
                  intradayFailed={intraday?.failed.kospi200 ?? false}
                  formatPrice={formatKrw}
                  renderLiveValue={renderDomesticLive}
                  priceClassName="sm:text-xl sm:font-medium"
                />
                <MiniIndexCell
                  label="코스닥150"
                  cell={data.quotes.kosdaq150}
                  bars={intraday?.quotes.kosdaq150 ?? EMPTY_BARS}
                  intradayFailed={intraday?.failed.kosdaq150 ?? false}
                  formatPrice={formatKrw}
                  renderLiveValue={renderDomesticLive}
                  priceClassName="sm:text-xl sm:font-medium"
                />
              </div>
            </div>
          )}
          <OverseasIndexList snapshotsByCode={overseasSnapshotsByCode} />
        </div>
      </StockPanel>
    </section>
  );
};
