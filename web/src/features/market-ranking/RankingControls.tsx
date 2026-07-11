"use client";

import { cn } from "@/lib/utils";

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: string;
};

export const TabButton = ({ active, onClick, children }: TabButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "border-b-2 pb-2 text-sm transition-colors",
      active
        ? "border-foreground font-medium text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

type PillProps = {
  active: boolean;
  onClick: () => void;
  children: string;
};

// 세그먼트 pill. 시장 셀렉터·등락률 서브·거래량 서브 모두 무채색 통일.
export const Pill = ({ active, onClick, children }: PillProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-sm px-2.5 py-1 text-xs transition-colors",
      active
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);
