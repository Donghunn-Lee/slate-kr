import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StockPanelVariant = "plain" | "sky" | "sage" | "amber" | "lavender" | "peach";

type StockPanelProps = {
  children: ReactNode;
  variant?: StockPanelVariant;
  noBorder?: boolean;
  className?: string;
};

const PANEL_VARIANT_CLASSES: Record<StockPanelVariant, { bg: string; border: string }> = {
  plain: { bg: "bg-elevated", border: "border-subtle" },
  sky: { bg: "bg-sky-bg", border: "border-sky-border" },
  sage: { bg: "bg-sage-bg", border: "border-sage-border" },
  amber: { bg: "bg-amber-bg", border: "border-amber-border" },
  lavender: { bg: "bg-lavender-bg", border: "border-lavender-border" },
  peach: { bg: "bg-peach-bg", border: "border-peach-border" },
};

export const StockPanel = ({
  children,
  variant = "plain",
  noBorder = false,
  className,
}: StockPanelProps) => {
  const { bg, border } = PANEL_VARIANT_CLASSES[variant];
  return (
    <div
      className={cn("rounded-lg shadow-slate p-6", bg, !noBorder && `border ${border}`, className)}
    >
      {children}
    </div>
  );
};
