"use client";

import { useState } from "react";
import Link from "next/link";
import type { FinancialPeriod } from "@/shared/types/stock";
import { formatFinancial, formatEps, formatPercent, formatRatio } from "@/shared/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type FinancialsTableProps = {
  periods: FinancialPeriod[];
  mode: "annual" | "quarterly";
  compact?: boolean;
};

type MetricRow = {
  label: string;
  getValue: (p: FinancialPeriod) => string;
  getRaw: (p: FinancialPeriod) => number | null;
};

const METRIC_ROWS: MetricRow[] = [
  // 손익
  { label: "매출", getValue: (p) => formatFinancial(p.revenue, false), getRaw: (p) => p.revenue },
  {
    label: "영업이익",
    getValue: (p) => formatFinancial(p.operatingProfit, false),
    getRaw: (p) => p.operatingProfit,
  },
  {
    label: "영업이익률(%)",
    getValue: (p) => formatPercent(p.operatingMargin, false),
    getRaw: (p) => p.operatingMargin,
  },
  {
    label: "당기순이익",
    getValue: (p) => formatFinancial(p.netIncome, false),
    getRaw: (p) => p.netIncome,
  },
  {
    label: "순이익률(%)",
    getValue: (p) => formatPercent(p.netMargin, false),
    getRaw: (p) => p.netMargin,
  },
  // 수익성
  { label: "ROE(%)", getValue: (p) => formatPercent(p.roe, false), getRaw: (p) => p.roe },
  { label: "ROA(%)", getValue: (p) => formatPercent(p.roa, false), getRaw: (p) => p.roa },
  // 주당 / 밸류에이션
  { label: "EPS(원)", getValue: (p) => formatEps(p.eps, false), getRaw: (p) => p.eps },
  { label: "BPS(원)", getValue: (p) => formatEps(p.bps, false), getRaw: (p) => p.bps },
  { label: "PER(배)", getValue: (p) => formatRatio(p.per, 2, false), getRaw: (p) => p.per },
  { label: "PBR(배)", getValue: (p) => formatRatio(p.pbr, 2, false), getRaw: (p) => p.pbr },
  // 재무 건전성
  {
    label: "자산총계",
    getValue: (p) => formatFinancial(p.totalAssets, false),
    getRaw: (p) => p.totalAssets,
  },
  {
    label: "자본총계",
    getValue: (p) => formatFinancial(p.totalEquity, false),
    getRaw: (p) => p.totalEquity,
  },
  {
    label: "부채비율(%)",
    getValue: (p) => formatPercent(p.debtRatio, false),
    getRaw: (p) => p.debtRatio,
  },
];

const SUMMARY_LABELS = new Set([
  "매출",
  "영업이익",
  "당기순이익",
  "영업이익률(%)",
  "ROE(%)",
  "부채비율(%)",
]);

const periodLabel = (p: FinancialPeriod, mode: "annual" | "quarterly"): string => {
  if (mode === "annual") return `${p.year}년`;
  return `${p.year} Q${p.quarter}`;
};

const FinancialsTable = ({ periods, mode, compact }: FinancialsTableProps) => {
  if (periods.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }

  const ordered = [...periods].reverse();
  const rows = compact ? METRIC_ROWS.filter((r) => SUMMARY_LABELS.has(r.label)) : METRIC_ROWS;

  return (
    <div className={compact ? undefined : "overflow-x-auto"}>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th
              className={`sticky left-0 z-10 bg-amber-bg ${compact ? "pb-1 pr-3" : "pb-2 pr-4"} text-left text-xs font-medium text-muted-foreground`}
            >
              지표
            </th>
            {ordered.map((p) => (
              <th
                key={mode === "annual" ? p.year : `${p.year}-${p.quarter}`}
                className={`${compact ? "pb-1 pl-3" : "pb-2 pl-4"} text-right text-xs font-medium text-muted-foreground whitespace-nowrap`}
              >
                {periodLabel(p, mode)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td
                className={`sticky left-0 z-10 bg-amber-bg border-r border-amber-border ${compact ? "py-1.5 pr-3 text-xs" : "py-3 pr-4 text-sm"} font-medium whitespace-nowrap`}
              >
                {row.label}
              </td>
              {ordered.map((p) => {
                const raw = row.getRaw(p);
                const isNegative = raw !== null && raw < 0;
                return (
                  <td
                    key={mode === "annual" ? p.year : `${p.year}-${p.quarter}`}
                    className={`${compact ? "py-1.5 pl-3 text-xs" : "py-3 pl-4 text-sm"} text-right tabular-nums${isNegative ? " text-destructive" : ""}`}
                  >
                    {row.getValue(p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

type StockFinancialsClientProps = {
  annual: FinancialPeriod[];
  quarterly: FinancialPeriod[];
  viewAllHref?: string;
  compact?: boolean;
};

export const StockFinancialsClient = ({
  annual,
  quarterly,
  viewAllHref,
  compact,
}: StockFinancialsClientProps) => {
  const defaultTab = annual.length === 0 && quarterly.length > 0 ? "quarterly" : "annual";
  const [tab, setTab] = useState<"annual" | "quarterly">(defaultTab);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "annual" | "quarterly")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">재무 요약</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-muted-foreground hover:underline">
            전체 보기 →
          </Link>
        )}
      </div>
      <div className="mb-3 flex justify-end">
        <TabsList variant="line" className={compact ? "h-5 p-0" : "h-6 p-0"}>
          <TabsTrigger
            value="annual"
            className={compact ? "h-5 px-2 py-0 text-xs" : "h-6 px-3 py-0 text-xs"}
          >
            연간
          </TabsTrigger>
          <TabsTrigger
            value="quarterly"
            className={compact ? "h-5 px-2 py-0 text-xs" : "h-6 px-3 py-0 text-xs"}
          >
            분기
          </TabsTrigger>
        </TabsList>
      </div>
      <p className={`${compact ? "mb-2" : "mb-3"} text-xs text-muted-foreground`}>
        단위: 억원 (별도 표기 없는 항목 기준)
      </p>
      <TabsContent value="annual">
        <FinancialsTable periods={annual} mode="annual" compact={compact} />
      </TabsContent>
      <TabsContent value="quarterly">
        <FinancialsTable periods={quarterly} mode="quarterly" compact={compact} />
      </TabsContent>
    </Tabs>
  );
};
