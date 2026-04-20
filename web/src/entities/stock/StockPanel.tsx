import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StockPanelVariant = "default" | "chart" | "financials" | "disclosures";

type StockPanelProps = {
  children: ReactNode;
  variant?: StockPanelVariant;
  noBorder?: boolean;
  className?: string;
};

const variantClasses: Record<StockPanelVariant, string> = {
  default: "",
  chart: "border-l-[3px] border-l-violet-400/70",
  financials: "border-l-[3px] border-l-teal-400/70",
  disclosures: "border-l-[3px] border-l-amber-400/70",
};

export const StockPanel = ({
  children,
  variant = "default",
  noBorder = false,
  className,
}: StockPanelProps) => {
  return (
    <div
      className={cn(
        "rounded-xl bg-neutral-900 p-6",
        !noBorder && "border border-white/10",
        !noBorder && variantClasses[variant],
        className
      )}
    >
      {children}
    </div>
  );
};
