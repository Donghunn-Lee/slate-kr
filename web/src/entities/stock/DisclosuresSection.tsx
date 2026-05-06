"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { DartDisclosure } from "@/shared/types/stock";
import { formatDartDate } from "@/shared/format";
import { classifyDisclosure } from "@/shared/utils/classifyDisclosure";
import { cn } from "@/lib/utils";
import { StockPanel } from "./StockPanel";
import { CheckpointBadge } from "./CheckpointBadge";
import { SummarySlate, type SummarySelection } from "@/features/disclosure-summary/SummarySlate";
import { Button } from "@/components/ui/button";

type DisclosureItemProps = {
  disclosure: DartDisclosure;
  onSummaryRequest: (selection: SummarySelection) => void;
};

const DisclosureItem = ({ disclosure, onSummaryRequest }: DisclosureItemProps) => {
  const type = classifyDisclosure(disclosure.disclosureNm);
  return (
    <li className="border-b border-border/60 py-3 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <a
          href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.rcpNo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-w-0 flex-1 items-start gap-2"
        >
          {type && <CheckpointBadge type={type} />}
          <p className="text-sm font-medium group-hover:underline">{disclosure.disclosureNm}</p>
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {formatDartDate(disclosure.rcptDt)}
            {disclosure.flrNm && <span className="ml-2">{disclosure.flrNm}</span>}
            {disclosure.rmk && (
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">
                {disclosure.rmk}
              </span>
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() =>
              onSummaryRequest({
                rcept_no: disclosure.rcpNo,
                disclosure_nm: disclosure.disclosureNm,
              })
            }
          >
            AI 요약
          </Button>
        </div>
      </div>
    </li>
  );
};

type DisclosuresSectionProps = {
  disclosures: DartDisclosure[];
  noApiKey: boolean;
};

export const DisclosuresSection = ({ disclosures, noApiKey }: DisclosuresSectionProps) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selection, setSelection] = useState<SummarySelection | null>(null);

  const handleSummaryRequest = (next: SummarySelection) => {
    setSelection(next);
    setPanelOpen(true);
  };

  return (
    <>
      {/* 우측 고정 슬라이드 토글 */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        className={cn(
          "fixed top-1/2 z-40 -translate-y-1/2",
          "flex h-14 w-5 items-center justify-center",
          "rounded-l-md border border-r-0 border-white/10 bg-neutral-800",
          "text-muted-foreground transition-all duration-200",
          "hover:bg-neutral-700 hover:text-foreground",
          panelOpen ? "right-[384px]" : "right-0"
        )}
        aria-label={panelOpen ? "AI 요약 패널 닫기" : "AI 요약 패널 열기"}
      >
        {panelOpen ? (
          <ChevronRightIcon className="size-3" />
        ) : (
          <ChevronLeftIcon className="size-3" />
        )}
      </button>

      <StockPanel variant="disclosures">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">최근 공시 (최근 3개월)</h2>
        {noApiKey ? (
          <p className="text-sm text-muted-foreground">
            DART API 키 미설정 — 공시 데이터를 불러올 수 없습니다
          </p>
        ) : disclosures.length === 0 ? (
          <p className="text-sm text-muted-foreground">최근 공시 없음</p>
        ) : (
          <ul>
            {disclosures.map((d) => (
              <DisclosureItem
                key={d.rcpNo}
                disclosure={d}
                onSummaryRequest={handleSummaryRequest}
              />
            ))}
          </ul>
        )}
      </StockPanel>

      <SummarySlate open={panelOpen} onOpenChange={setPanelOpen} selection={selection} />
    </>
  );
};
