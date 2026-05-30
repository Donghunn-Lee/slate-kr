"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DartDisclosure } from "@/shared/types/stock";
import { formatDartDate } from "@/shared/format";
import { classifyDisclosure } from "@/shared/utils/classifyDisclosure";
import { cn } from "@/lib/utils";
import { StockPanel } from "./StockPanel";
import { CheckpointBadge } from "./CheckpointBadge";
import { Button } from "@/components/ui/button";

type SummaryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; summary: string }
  | { kind: "blocked"; reason: "file_not_found" | "not_summarizable" }
  | { kind: "error"; errorKind: string };

type ApiResponse = { ok: true; summary: string } | { ok: false; error: { kind: string } };

const RETRYABLE = new Set(["rate_limit", "timeout", "api_error", "empty_response"]);

type DisclosureItemProps = {
  disclosure: DartDisclosure;
  isExpanded: boolean;
  onToggle: () => void;
  dimmed: boolean;
};

const DisclosureItem = ({ disclosure, isExpanded, onToggle, dimmed }: DisclosureItemProps) => {
  const type = classifyDisclosure(disclosure.disclosureNm);
  const [summaryState, setSummaryState] = useState<SummaryState>({ kind: "idle" });
  const fetchInitiated = useRef(false);

  const doFetch = useCallback(async () => {
    setSummaryState({ kind: "loading" });
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
        setSummaryState({ kind: "error", errorKind: "api_error" });
        return;
      }

      const data = (await res.json()) as ApiResponse;

      if (data.ok) {
        setSummaryState({ kind: "success", summary: data.summary });
      } else {
        const kind = data.error?.kind ?? "api_error";
        if (kind === "file_not_found" || kind === "not_summarizable") {
          setSummaryState({ kind: "blocked", reason: kind as "file_not_found" | "not_summarizable" });
        } else {
          setSummaryState({ kind: "error", errorKind: kind });
        }
      }
    } catch {
      setSummaryState({ kind: "error", errorKind: "api_error" });
    }
  }, [disclosure.rcpNo, disclosure.disclosureNm]);

  useEffect(() => {
    if (isExpanded && !fetchInitiated.current) {
      fetchInitiated.current = true;
      doFetch();
    }
  }, [isExpanded, doFetch]);

  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.rcpNo}`;

  return (
    <li
      className="-mx-6 border-b border-amber-border px-6 py-3 last:border-0 hover:bg-amber-border"
      style={{
        opacity: dimmed ? 0.5 : 1,
        transition:
          "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), background-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={dartUrl}
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
          <a
            href={dartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-amber-border bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap hover:text-foreground"
            style={{
              transition:
                "color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
            }}
          >
            DART 원문
          </a>
          <button
            type="button"
            className={cn(
              "rounded border border-amber-border bg-elevated px-2 py-0.5 text-[11px] font-medium whitespace-nowrap cursor-pointer",
              isExpanded ? "text-muted-foreground hover:text-foreground" : "text-amber-accent hover:bg-amber-bg",
            )}
            style={{
              transition:
                "color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), background-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
            }}
            onClick={onToggle}
          >
            {isExpanded ? "닫기" : "AI 요약"}
          </button>
        </div>
      </div>

      {/* Inline expansion — grid trick for smooth height animation */}
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {summaryState.summary}
                </p>
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
                          : "지금은 요약을 시도하기 어렵습니다. 잠시 후 다시 시도해주세요."}
                  </p>
                  {RETRYABLE.has(summaryState.errorKind) && (
                    <Button variant="outline" size="sm" onClick={doFetch}>
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
  disclosures: DartDisclosure[];
  noApiKey: boolean;
  hasError: boolean;
};

export const DisclosuresSection = ({
  disclosures,
  noApiKey,
  hasError,
}: DisclosuresSectionProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <StockPanel variant="amber">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">최근 공시 (최근 3개월)</h2>
      {noApiKey ? (
        <p className="text-sm text-muted-foreground">
          DART API 키 미설정 — 공시 데이터를 불러올 수 없습니다
        </p>
      ) : hasError ? (
        <p className="text-sm text-muted-foreground">공시를 불러오지 못했습니다</p>
      ) : disclosures.length === 0 ? (
        <p className="text-sm text-muted-foreground">최근 공시 없음</p>
      ) : (
        <ul>
          {disclosures.map((d) => (
            <DisclosureItem
              key={d.rcpNo}
              disclosure={d}
              isExpanded={expandedId === d.rcpNo}
              onToggle={() => handleToggle(d.rcpNo)}
              dimmed={expandedId !== null && expandedId !== d.rcpNo}
            />
          ))}
        </ul>
      )}
    </StockPanel>
  );
};
