"use client";

import { useState } from "react";
import type { FinancialPeriod } from "@/shared/types/stock";
import { formatFinancial, formatEps, formatPercent } from "@/shared/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type FinancialsTableProps = {
  periods: FinancialPeriod[];
  mode: "annual" | "quarterly";
};

type MetricRow = {
  label: string;
  getValue: (p: FinancialPeriod) => string;
};

const METRIC_ROWS: MetricRow[] = [
  { label: "매출", getValue: (p) => formatFinancial(p.revenue) },
  { label: "영업이익", getValue: (p) => formatFinancial(p.operatingProfit) },
  { label: "영업이익률", getValue: (p) => formatPercent(p.operatingMargin) },
  { label: "당기순이익", getValue: (p) => formatFinancial(p.netIncome) },
  { label: "순이익률", getValue: (p) => formatPercent(p.netMargin) },
  { label: "EPS", getValue: (p) => formatEps(p.eps) },
  { label: "BPS", getValue: (p) => formatEps(p.bps) },
  { label: "자산총계", getValue: (p) => formatFinancial(p.totalAssets) },
  { label: "자본총계", getValue: (p) => formatFinancial(p.totalEquity) },
  { label: "부채비율", getValue: (p) => formatPercent(p.debtRatio) },
  { label: "ROE", getValue: (p) => formatPercent(p.roe) },
  { label: "ROA", getValue: (p) => formatPercent(p.roa) },
];

const periodLabel = (p: FinancialPeriod, mode: "annual" | "quarterly"): string => {
  if (mode === "annual") return `${p.year}년`;
  return `${p.year} Q${p.quarter}`;
};

const FinancialsTable = ({ periods, mode }: FinancialsTableProps) => {
  if (periods.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 bg-sage-bg pb-2 pr-4 text-left text-xs font-medium text-muted-foreground">
              지표
            </th>
            {periods.map((p) => (
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
              {periods.map((p) => (
                <td
                  key={mode === "annual" ? p.year : `${p.year}-${p.quarter}`}
                  className="py-3 pl-4 text-right text-sm tabular-nums"
                >
                  {row.getValue(p)}
                </td>
              ))}
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
};

export const StockFinancialsClient = ({ annual, quarterly }: StockFinancialsClientProps) => {
  const defaultTab = annual.length === 0 && quarterly.length > 0 ? "quarterly" : "annual";
  const [tab, setTab] = useState<"annual" | "quarterly">(defaultTab);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "annual" | "quarterly")}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">재무 요약</h2>
        <TabsList className="h-7">
          <TabsTrigger value="annual" className="text-xs px-3 h-6">
            연간
          </TabsTrigger>
          <TabsTrigger value="quarterly" className="text-xs px-3 h-6">
            분기
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="annual">
        <FinancialsTable periods={annual} mode="annual" />
      </TabsContent>
      <TabsContent value="quarterly">
        <FinancialsTable periods={quarterly} mode="quarterly" />
      </TabsContent>
    </Tabs>
  );
};
