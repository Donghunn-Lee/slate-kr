"use client";

import { Fragment } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { INDEX_CODES, INDEX_LABEL, type IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";
import { useIndexQuotes, type IndexCellData } from "@/features/index-quotes/useIndexQuotes";
import { cn } from "@/lib/utils";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexAccordionProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<IndexCode, PriceStats | null>;
  volumeByIndex: Record<IndexCode, number | null>;
  initialSelected: IndexCode;
};

// useIndexQuotes 응답 키 매핑 — IndexChart 의 CELL_KEY 와 동일 축.
const CELL_KEY: Record<IndexCode, "kospi" | "kosdaq" | "kospi200"> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KOSPI200: "kospi200",
};

// 요약행 상단 overline — 텍스처용 영문 라벨. 정보가 아니라 시각 리듬이므로 muted 톤만.
const INDEX_OVERLINE: Record<IndexCode, string> = {
  KOSPI: "KOSPI",
  KOSDAQ: "KOSDAQ",
  KOSPI200: "KOSPI 200",
};

// 지수값 — 원 단위 아님. 소수 최대 2자리, ko-KR 로케일.
const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

// 지수 누적 거래량 — 값이 수억 단위라 헤더 밀도 확보를 위해 억/만 축약.
const formatIndexVolume = (v: number): string => {
  const eok = v / 100_000_000;
  if (eok >= 1) return `${eok.toFixed(1)}억`;
  const man = v / 10_000;
  if (man >= 1) return `${Math.round(man).toLocaleString("ko-KR")}만`;
  return v.toLocaleString("ko-KR");
};

// 기간 수익률 표시. PriceStatsCard 와 동일 규약 — 상장 미달(null) 은 "—".
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

const MarketStatus = ({
  marketOpen,
  date,
}: {
  marketOpen: boolean;
  date?: string;
}) =>
  marketOpen ? (
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
      실시간
    </div>
  ) : (
    <div className="text-[13px] text-muted-foreground">
      15:30 장 마감{date ? ` · 기준일 ${date}` : ""}
    </div>
  );

type SummaryClusterProps = {
  overline: string;
  label: string;
  cell: IndexCellData | undefined;
  volume: number | null;
  loading: boolean;
};

// 좌측 클러스터: overline · 지수명 · 현재가+등락률(+거래량 append).
// live > fallback(직전 거래일) > "데이터 없음" 폴백은 IndexSlate 규칙과 정합.
const SummaryCluster = ({
  overline,
  label,
  cell,
  volume,
  loading,
}: SummaryClusterProps) => (
  <div className="flex flex-col gap-0.5 text-left">
    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      {overline}
    </span>
    <span className="text-lg font-medium">{label}</span>
    {loading && !cell ? (
      <div className="mt-1 h-5 w-40 animate-pulse rounded bg-muted" />
    ) : cell?.live ? (
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">
          <PriceCountUp from={cell.live.price} to={cell.live.price} />
        </span>
        <PriceChange
          change={cell.live.change}
          changeRate={cell.live.changeRate}
          sign={cell.live.sign}
          symbol="arrow"
          size="sm"
        />
        {volume !== null && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            거래량 {formatIndexVolume(volume)}
          </span>
        )}
      </div>
    ) : cell?.fallback ? (
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">
          {formatIndexPrice(cell.fallback.close)}
        </span>
        <PriceChange
          change={cell.fallback.change}
          changeRate={cell.fallback.changeRate}
          symbol="arrow"
          size="sm"
        />
        <span className="text-[11px] text-muted-foreground">직전 거래일</span>
        {volume !== null && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            · 거래량 {formatIndexVolume(volume)}
          </span>
        )}
      </div>
    ) : (
      <span className="text-sm text-muted-foreground">데이터 없음</span>
    )}
  </div>
);

// 중앙 클러스터: 4행 그리드 — 52주 저·고 + 1M/3M/1Y 수익률 각 1행.
// 좌열=라벨, 우열=값. text-xs + gap-y-1 로 좌측 클러스터 높이(overline/label/price)와 정합.
// 데스크탑 전용(모바일 hidden). stats null(SSR 실패·데이터 부족) 이면 클러스터 스킵.
const StatsCluster = ({ stats }: { stats: PriceStats | null }) => {
  if (!stats) return null;
  const { range52w, returns } = stats;
  return (
    <div className="hidden grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs tabular-nums md:grid">
      {range52w !== null && (
        <>
          <span className="text-muted-foreground">52주</span>
          <div className="flex items-baseline gap-3">
            <span>
              <span className="text-muted-foreground/70">저 </span>
              {formatIndexPrice(range52w.low)}
            </span>
            <span>
              <span className="text-muted-foreground/70">고 </span>
              {formatIndexPrice(range52w.high)}
            </span>
          </div>
        </>
      )}
      {returns.map(({ period, value }) => (
        <Fragment key={period}>
          <span className="text-muted-foreground">{period}</span>
          <span className={cn("font-medium", returnColorClass(value))}>
            {value === null ? "—" : formatReturn(value)}
          </span>
        </Fragment>
      ))}
    </div>
  );
};

export const IndexAccordion = ({
  dailyByIndex,
  statsByIndex,
  volumeByIndex,
  initialSelected,
}: IndexAccordionProps) => {
  const { data, isLoading } = useIndexQuotes();

  // collapsible → 열린 지수 클릭 시 닫힘. next==="" 은 전부 닫힘 상태.
  // URL 은 열림 지수만 반영, 닫힘 시 ?index= 제거.
  const handleValueChange = (next: string) => {
    if (typeof window === "undefined") return;
    const url = next === "" ? "/stocks/indices" : `/stocks/indices?index=${next}`;
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end px-1">
        {data ? (
          <MarketStatus
            marketOpen={data.marketOpen}
            date={data.quotes.kospi.fallback?.date}
          />
        ) : null}
      </div>
      <Accordion
        type="single"
        defaultValue={initialSelected}
        onValueChange={handleValueChange}
        collapsible
        className="space-y-4"
      >
        {INDEX_CODES.map((code) => {
          const prices = dailyByIndex[code];
          const cell = data?.quotes[CELL_KEY[code]];
          return (
            <AccordionItem key={code} value={code} className="group border-b-0">
              <StockPanel
                variant="lavender"
                className="overflow-hidden p-0 transition-colors group-data-[state=open]:border-lavender-accent group-data-[state=open]:bg-lavender-emphasis"
              >
                <AccordionTrigger className="px-6 py-4 transition-colors hover:bg-lavender-emphasis">
                  <div className="flex flex-1 items-center gap-8">
                    <SummaryCluster
                      overline={INDEX_OVERLINE[code]}
                      label={INDEX_LABEL[code]}
                      cell={cell}
                      volume={volumeByIndex[code]}
                      loading={isLoading}
                    />
                    <StatsCluster stats={statsByIndex[code]} />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  {/* Radix Content 는 open 시에만 자식을 마운트하고 width 는 애니메이션 중
                      유지되므로 (height 만 keyframes 로 animate + overflow hidden),
                      height=450 고정 차트는 0폭 초기화 문제가 없다. */}
                  {prices !== null && prices !== undefined ? (
                    <IndexChartDynamic indexCode={code} prices={prices} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      차트 데이터를 불러오지 못했습니다
                    </p>
                  )}
                </AccordionContent>
              </StockPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
