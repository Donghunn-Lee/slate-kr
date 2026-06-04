"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TabAccent = "neutral" | "lavender" | "sage" | "amber";

type TabDef = {
  hrefSuffix: string;
  label: string;
  accent: TabAccent;
};

const TABS = [
  { hrefSuffix: "", label: "종합정보", accent: "neutral" },
  { hrefSuffix: "/chart", label: "차트", accent: "lavender" },
  { hrefSuffix: "/financials", label: "재무", accent: "sage" },
  { hrefSuffix: "/disclosures", label: "공시", accent: "amber" },
] as const satisfies readonly TabDef[];

const ACCENT_CLASSES: Record<TabAccent, string> = {
  neutral: "bg-elevated border-subtle",
  lavender: "bg-lavender-bg border-lavender-border",
  sage: "bg-sage-bg border-sage-border",
  amber: "bg-amber-bg border-amber-border",
};

type StockTabPanelProps = {
  ticker: string;
  children: ReactNode;
};

export const StockTabPanel = ({ ticker, children }: StockTabPanelProps) => {
  const pathname = usePathname();
  const base = `/stocks/${ticker}`;

  const matchedIndex = TABS.findIndex((tab) => {
    const href = `${base}${tab.hrefSuffix}`;
    return tab.hrefSuffix === "" ? pathname === href : pathname.startsWith(href);
  });
  const activeIndex = matchedIndex === -1 ? 0 : matchedIndex;
  const activeAccent = TABS[activeIndex].accent;

  return (
    <div className="w-full">
      <div className="sticky top-0 z-20 flex items-end gap-2 bg-background pt-2">
        {TABS.map((tab, i) => {
          const href = `${base}${tab.hrefSuffix}`;
          const isActive = i === activeIndex;

          return (
            <Link
              key={tab.label}
              href={href}
              scroll={false}
              className={cn(
                "relative flex items-center justify-center rounded-t-md border px-6 py-2 text-sm transition-colors",
                ACCENT_CLASSES[tab.accent],
                isActive
                  ? "z-20 -mb-px border-b-transparent font-medium text-foreground"
                  : "z-10 border-b-0 text-muted-foreground opacity-80 hover:opacity-100"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div
        className={cn(
          "relative z-10 rounded-md border p-6",
          ACCENT_CLASSES[activeAccent],
          activeIndex === 0 ? "rounded-tl-none" : ""
        )}
      >
        {children}
      </div>
    </div>
  );
};
