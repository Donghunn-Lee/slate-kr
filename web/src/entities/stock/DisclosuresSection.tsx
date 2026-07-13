"use client";

import { useCallback, useRef, useState } from "react";
import type { DartDisclosure } from "@/shared/types/stock";
import type { DisclosureSummaryContent } from "@/shared/types/disclosureSummary";
import { formatDartDate } from "@/shared/format";
import { classifyDisclosure } from "@/shared/utils/classifyDisclosure";
import { cn } from "@/lib/utils";
import { DisclosureFilters } from "@/features/disclosure/DisclosureFilters";
import { DisclosurePagination } from "@/features/disclosure/DisclosurePagination";
import type { PeriodPreset } from "@/features/disclosure/types";
import { CheckpointBadge } from "./CheckpointBadge";
import { DisclosureSummaryBody } from "./DisclosureSummaryBody";
import { Button } from "@/components/ui/button";

type SettledState =
  | { kind: "success"; content: DisclosureSummaryContent }
  | { kind: "blocked"; reason: "file_not_found" | "not_summarizable" }
  | { kind: "error"; errorKind: string };

type SummaryState = { kind: "idle" } | { kind: "loading" } | SettledState;

type ApiResponse =
  | { ok: true; content: DisclosureSummaryContent }
  | { ok: false; error: { kind: string } };

const RETRYABLE = new Set([
  "rate_limit",
  "timeout",
  "api_error",
  "empty_response",
  "parse_failed",
]);

const GRID_COLS =
  "grid-cols-[minmax(0,1fr)_60px] gap-1 md:grid-cols-[72px_88px_minmax(0,1fr)_88px_72px_32px_60px] md:gap-2 items-center";

type DisclosureItemProps = {
  disclosure: DartDisclosure;
  isExpanded: boolean;
  hasAnyExpanded: boolean;
  onToggle: () => void;
};

const DisclosureItem = ({
  disclosure,
  isExpanded,
  hasAnyExpanded,
  onToggle,
}: DisclosureItemProps) => {
  const type = classifyDisclosure(disclosure.disclosureNm);
  const [settled, setSettled] = useState<SettledState | null>(null);
  const fetchInitiated = useRef(false);

  const summaryState: SummaryState =
    settled ?? (isExpanded ? { kind: "loading" } : { kind: "idle" });

  const doFetch = useCallback(async () => {
    try {
      const res = await fetch("/api/disclosure-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rcept_no: disclosure.rcpNo,
          disclosure_nm: disclosure.disclosureNm,
        }),
      });

      if (!res.ok) {
        setSettled({ kind: "error", errorKind: "api_error" });
        return;
      }

      const data = (await res.json()) as ApiResponse;

      if (data.ok) {
        setSettled({ kind: "success", content: data.content });
      } else {
        const kind = data.error?.kind ?? "api_error";
        if (kind === "file_not_found" || kind === "not_summarizable") {
          setSettled({ kind: "blocked", reason: kind as "file_not_found" | "not_summarizable" });
        } else {
          setSettled({ kind: "error", errorKind: kind });
        }
      }
    } catch {
      setSettled({ kind: "error", errorKind: "api_error" });
    }
  }, [disclosure.rcpNo, disclosure.disclosureNm]);

  const handleRetry = useCallback(() => {
    setSettled(null);
    void doFetch();
  }, [doFetch]);

  const handleToggleClick = useCallback(() => {
    if (!isExpanded && !fetchInitiated.current) {
      fetchInitiated.current = true;
      void doFetch();
    }
    onToggle();
  }, [isExpanded, doFetch, onToggle]);

  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.rcpNo}`;
  const dimmed = hasAnyExpanded && !isExpanded;

  return (
    <li
      className={cn(
        "group -mx-6 px-6",
        isExpanded
          ? "bg-sky-border"
          : "bg-transparent transition-colors hover:bg-sky-border/40",
        dimmed && "opacity-50"
      )}
      style={{
        transition: isExpanded
          ? "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))"
          : "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), background-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
      }}
    >
      <div className={cn("grid", GRID_COLS, "border-b border-sky-border/30 py-2 md:py-3 group-last:border-b-0")}>
        <div className="hidden text-center md:block">
          {type && <CheckpointBadge type={type} />}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 md:contents">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className="hidden min-w-0 truncate text-[11px] text-muted-foreground md:block">
              {disclosure.corpName}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground md:hidden">
              {formatDartDate(disclosure.rcptDt)}
            </span>
            <div className="flex shrink-0 items-center md:hidden">
              {type && <CheckpointBadge type={type} />}
            </div>
          </div>
          <a
            href={dartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium hover:underline"
            title={disclosure.disclosureNm}
          >
            {disclosure.disclosureNm}
          </a>
        </div>
        <div className="hidden md:contents">
          <div className="truncate text-xs text-muted-foreground" title={disclosure.flrNm}>
            {disclosure.flrNm}
          </div>
          <div className="text-xs text-muted-foreground md:text-center">
            {formatDartDate(disclosure.rcptDt)}
          </div>
        </div>
        <div className="hidden text-center text-xs text-muted-foreground md:block">
          {disclosure.rmk && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{disclosure.rmk}</span>
          )}
        </div>
        <button
          type="button"
          className={cn(
            "w-full rounded border border-sky-border bg-elevated px-1 py-0.5 text-[11px] font-medium whitespace-nowrap cursor-pointer",
            isExpanded
              ? "text-muted-foreground hover:text-foreground"
              : "text-sky-accent hover:bg-sky-bg"
          )}
          style={{
            transition:
              "color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), background-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
          }}
          onClick={handleToggleClick}
        >
          {isExpanded ? "닫기" : "AI 요약"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition:
            "grid-template-rows var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div className="pt-3 pb-1">
            <div className="rounded-sm border border-lavender-border/60 bg-lavender-bg/70 px-4 py-3">
              {summaryState.kind === "loading" && (
                <div className="animate-pulse space-y-2.5">
                  <div className="h-3.5 w-full rounded bg-muted" />
                  <div className="h-3.5 w-11/12 rounded bg-muted" />
                  <div className="h-3.5 w-4/5 rounded bg-muted" />
                  <div className="h-3.5 w-full rounded bg-muted" />
                  <div className="h-3.5 w-3/4 rounded bg-muted" />
                </div>
              )}

              {summaryState.kind === "success" && (
                <DisclosureSummaryBody content={summaryState.content} />
              )}

              {summaryState.kind === "blocked" && (
                <p className="text-sm text-muted-foreground">
                  {summaryState.reason === "file_not_found"
                    ? "원문이 보관되지 않은 공시입니다. 요약을 제공할 수 없습니다."
                    : "정기보고서는 요약 대상이 아닙니다. 분량이 매우 커 별도 처리가 필요합니다."}
                </p>
              )}

              {summaryState.kind === "error" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {summaryState.errorKind === "safety_blocked"
                      ? "이 공시는 자동 요약에서 제외되었습니다."
                      : summaryState.errorKind === "invalid_request"
                        ? "잘못된 요청입니다."
                        : summaryState.errorKind === "empty_response"
                          ? "요약 결과를 받지 못했습니다. 잠시 후 다시 시도해주세요."
                          : summaryState.errorKind === "parse_failed"
                            ? "요약 형식을 해석하지 못했습니다. 다시 시도해주세요."
                            : "지금은 요약을 시도하기 어렵습니다. 잠시 후 다시 시도해주세요."}
                  </p>
                  {RETRYABLE.has(summaryState.errorKind) && (
                    <Button variant="outline" size="sm" onClick={handleRetry}>
                      다시 시도
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

type DisclosuresSectionProps = {
  ticker: string;
  disclosures: DartDisclosure[];
  totalCount: number;
  totalPage: number;
  currentPage: number;
  preset: PeriodPreset;
  bgnDate?: string;
  endDate?: string;
  query: string;
  noApiKey: boolean;
  hasError: boolean;
};

export const DisclosuresSection = ({
  ticker,
  disclosures,
  totalCount,
  totalPage,
  currentPage,
  preset,
  bgnDate,
  endDate,
  query,
  noApiKey,
  hasError,
}: DisclosuresSectionProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const hasAnyExpanded = expandedId !== null;

  const emptyMessage =
    query !== ""
      ? "현재 기간 내에 검색 결과가 없습니다. 기간을 늘려보세요."
      : "최근 공시가 없습니다.";

  const showFooter = !noApiKey && !hasError;

  return (
    <>
      <header className="-mx-6 mb-3 border-sky-border/50 px-6 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">공시 목록</h2>
          {!noApiKey && !hasError && totalCount > 0 && (
            <p className="text-xs text-muted-foreground">총 {totalCount.toLocaleString()}건</p>
          )}
        </div>

        <DisclosureFilters
          ticker={ticker}
          currentPreset={preset}
          currentBgnDate={bgnDate}
          currentEndDate={endDate}
          currentQuery={query}
        />
      </header>

      {noApiKey ? (
        <p className="py-2 text-sm text-muted-foreground">
          DART API 키 미설정 — 공시 데이터를 불러올 수 없습니다
        </p>
      ) : hasError ? (
        <p className="py-2 text-sm text-muted-foreground">공시를 불러오지 못했습니다</p>
      ) : disclosures.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div
            className={cn(
              "hidden md:grid",
              GRID_COLS,
              "border-b border-sky-border/50 pt-1 pb-2 text-center text-[11px] font-medium text-muted-foreground"
            )}
          >
            <div>유형</div>
            <div>대상회사</div>
            <div>보고서명</div>
            <div>제출인</div>
            <div>접수일자</div>
            <div>비고</div>
            <div />
          </div>
          <ul>
            {disclosures.map((d) => (
              <DisclosureItem
                key={d.rcpNo}
                disclosure={d}
                isExpanded={expandedId === d.rcpNo}
                hasAnyExpanded={hasAnyExpanded}
                onToggle={() => handleToggle(d.rcpNo)}
              />
            ))}
          </ul>
        </>
      )}

      {showFooter && (
        <footer className="mt-3 flex flex-col items-end gap-2 border-t border-sky-border/50 pt-3">
          <DisclosurePagination
            ticker={ticker}
            currentPage={currentPage}
            totalPage={totalPage}
            preset={preset}
            bgnDate={bgnDate}
            endDate={endDate}
            query={query}
          />
          <p className="text-xs text-tertiary">출처: DART 전자공시시스템</p>
        </footer>
      )}
    </>
  );
};
