"use client";

import { useState } from "react";
import Link from "next/link";
import type { FinancialPeriod } from "@/shared/types/stock";
import { formatFinancial, formatEps, formatPercent, formatRatio } from "@/shared/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type FinancialsTableProps = {
  periods: FinancialPeriod[];
  mode: "annual" | "quarterly";
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

const periodLabel = (p: FinancialPeriod, mode: "annual" | "quarterly"): string => {
  if (mode === "annual") return `${p.year}년`;
  return `${p.year} Q${p.quarter}`;
};

const FinancialsTable = ({ periods, mode }: FinancialsTableProps) => {
  if (periods.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }

  const ordered = [...periods].reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 bg-sage-bg pb-2 pr-4 text-left text-xs font-medium text-muted-foreground">
              지표
            </th>
            {ordered.map((p) => (
              <th
                key={mode === "annual" ? p.year : `${p.year}-${p.quarter}`}
                className="pb-2 pl-4 text-right text-xs font-medium text-muted-foreground whitespace-nowrap"
              >
                {periodLabel(p, mode)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="sticky left-0 z-10 bg-sage-bg border-r border-sage-border py-3 pr-4 text-sm font-medium whitespace-nowrap">
                {row.label}
              </td>
              {ordered.map((p) => {
                const raw = row.getRaw(p);
                const isNegative = raw !== null && raw < 0;
                return (
                  <td
                    key={mode === "annual" ? p.year : `${p.year}-${p.quarter}`}
                    className={`py-3 pl-4 text-right text-sm tabular-nums${isNegative ? " text-destructive" : ""}`}
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
};

export const StockFinancialsClient = ({
  annual,
  quarterly,
  viewAllHref,
}: StockFinancialsClientProps) => {
  const defaultTab = annual.length === 0 && quarterly.length > 0 ? "quarterly" : "annual";
  const [tab, setTab] = useState<"annual" | "quarterly">(defaultTab);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "annual" | "quarterly")}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">재무 요약</h2>
          {viewAllHref && (
            <Link href={viewAllHref} className="text-xs text-sage-accent hover:underline">
              전체 보기 →
            </Link>
          )}
        </div>
        <TabsList className="h-7">
          <TabsTrigger value="annual" className="text-xs px-3 h-6">
            연간
          </TabsTrigger>
          <TabsTrigger value="quarterly" className="text-xs px-3 h-6">
            분기
          </TabsTrigger>
        </TabsList>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">단위: 억원 (별도 표기 없는 항목 기준)</p>
      <TabsContent value="annual">
        <FinancialsTable periods={annual} mode="annual" />
      </TabsContent>
      <TabsContent value="quarterly">
        <FinancialsTable periods={quarterly} mode="quarterly" />
      </TabsContent>
    </Tabs>
  );
};
