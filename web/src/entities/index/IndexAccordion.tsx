"use client";

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
import { useIndexQuotes, type IndexCellData } from "@/features/index-quotes/useIndexQuotes";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexAccordionProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
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

type SummaryRowProps = {
  overline: string;
  label: string;
  cell: IndexCellData | undefined;
  loading: boolean;
};

// 좌측 클러스터 세로 스택: overline(영문) · 지수명 · 현재가+등락률.
// live > fallback(직전 거래일) > "데이터 없음" 순으로 line 3 폴백.
// (KIS index quote 응답에 거래량 필드 없음 — line 3 거래량 slot 은 다음 스텝.)
const SummaryRow = ({ overline, label, cell, loading }: SummaryRowProps) => (
  <div className="flex flex-col gap-0.5 text-left">
    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      {overline}
    </span>
    <span className="text-lg font-medium">{label}</span>
    {loading && !cell ? (
      <div className="mt-1 h-5 w-32 animate-pulse rounded bg-muted" />
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
      </div>
    ) : cell?.fallback ? (
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">
          {cell.fallback.close.toLocaleString("ko-KR")}
        </span>
        <PriceChange
          change={cell.fallback.change}
          changeRate={cell.fallback.changeRate}
          symbol="arrow"
          size="sm"
        />
        <span className="text-[11px] text-muted-foreground">직전 거래일</span>
      </div>
    ) : (
      <span className="text-sm text-muted-foreground">데이터 없음</span>
    )}
  </div>
);

export const IndexAccordion = ({
  dailyByIndex,
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
            // group 으로 AccordionItem 의 data-state 를 하위 StockPanel border 에 전달.
            <AccordionItem key={code} value={code} className="group border-b-0">
              <StockPanel
                variant="lavender"
                className="overflow-hidden p-0 transition-colors group-data-[state=open]:border-lavender-accent group-data-[state=open]:bg-lavender-emphasis"
              >
                <AccordionTrigger className="px-6 py-4 transition-colors hover:bg-lavender-emphasis">
                  <SummaryRow
                    overline={INDEX_OVERLINE[code]}
                    label={INDEX_LABEL[code]}
                    cell={cell}
                    loading={isLoading}
                  />
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
