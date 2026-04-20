import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StockPanelProps = {
  children: ReactNode;
  className?: string;
};

export const StockPanel = ({ children, className }: StockPanelProps) => {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-neutral-900 p-6", className)}>
      {children}
    </div>
  );
};
