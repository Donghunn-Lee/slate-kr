"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export type SummarySelection = {
  rcept_no: string;
  disclosure_nm: string;
};

type SummaryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; summary: string }
  | { kind: "blocked"; reason: "file_not_found" | "not_summarizable" }
  | { kind: "error"; errorKind: string };

type ApiResponse = { ok: true; summary: string } | { ok: false; error: { kind: string } };

const RETRYABLE = new Set(["rate_limit", "timeout", "api_error", "empty_response"]);

type SummarySlateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: SummarySelection | null;
};

export const SummarySlate = ({ open, onOpenChange, selection }: SummarySlateProps) => {
  const [state, setState] = useState<SummaryState>({ kind: "idle" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!selection) return;

    let cancelled = false;

    (async () => {
      setState({ kind: "loading" });

      try {
        const res = await fetch("/api/disclosure-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rcept_no: selection.rcept_no,
            disclosure_nm: selection.disclosure_nm,
          }),
        });

        if (!res.ok) {
          if (!cancelled) setState({ kind: "error", errorKind: "api_error" });
          return;
        }

        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;

        if (data.ok) {
          setState({ kind: "success", summary: data.summary });
        } else {
          const kind = data.error?.kind ?? "api_error";
          if (kind === "file_not_found" || kind === "not_summarizable") {
            setState({ kind: "blocked", reason: kind });
          } else {
            setState({ kind: "error", errorKind: kind });
          }
        }
      } catch {
        if (!cancelled) setState({ kind: "error", errorKind: "api_error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selection, retryCount]);

  const title = state.kind === "success" ? (selection?.disclosure_nm ?? "AI 요약") : "AI 요약";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        showOverlay={false}
        className="flex w-[400px] flex-col overflow-y-auto sm:max-w-[400px] border-l border-border/60 shadow-xl"
      >
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle className="pr-8 text-sm font-semibold leading-snug">{title}</SheetTitle>
          <SheetDescription className="sr-only">공시 AI 요약 패널</SheetDescription>
        </SheetHeader>

        <div className="flex-1 pt-4">
          {state.kind === "idle" && (
            <p className="text-sm text-muted-foreground">
              공시 목록에서 요약할 공시를 선택해주세요. AI 요약 버튼을 누르면 핵심 내용을 빠르게
              확인할 수 있습니다.
            </p>
          )}

          {state.kind === "loading" && (
            <div className="space-y-2.5 animate-pulse">
              <div className="h-3.5 rounded bg-muted w-full" />
              <div className="h-3.5 rounded bg-muted w-11/12" />
              <div className="h-3.5 rounded bg-muted w-4/5" />
              <div className="h-3.5 rounded bg-muted w-full" />
              <div className="h-3.5 rounded bg-muted w-3/4" />
            </div>
          )}

          {state.kind === "success" && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.summary}</p>
          )}

          {state.kind === "blocked" && (
            <p className="text-sm text-muted-foreground">
              {state.reason === "file_not_found"
                ? "원문이 보관되지 않은 공시입니다. 요약을 제공할 수 없습니다."
                : "정기보고서는 요약 대상이 아닙니다. 분량이 매우 커 별도 처리가 필요합니다."}
            </p>
          )}

          {state.kind === "error" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {state.errorKind === "safety_blocked"
                  ? "이 공시는 자동 요약에서 제외되었습니다."
                  : state.errorKind === "invalid_request"
                    ? "잘못된 요청입니다."
                    : state.errorKind === "empty_response"
                      ? "요약 결과를 받지 못했습니다. 잠시 후 다시 시도해주세요."
                      : "지금은 요약을 시도하기 어렵습니다. 잠시 후 다시 시도해주세요."}
              </p>
              {RETRYABLE.has(state.errorKind) && (
                <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
                  다시 시도
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
