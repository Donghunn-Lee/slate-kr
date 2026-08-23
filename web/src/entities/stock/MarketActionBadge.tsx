import type { MarketActionStatus } from "@/shared/types/quote";

type MarketActionBadgeProps = {
  status: MarketActionStatus;
};

const LABEL_BY_KIND: Record<MarketActionStatus["kind"], string> = {
  suspended: "거래정지",
  liquidation: "정리매매",
  managed: "관리종목",
  overheated: "단기과열",
  caution: "투자주의",
  warning: "투자경고",
  risk: "투자위험",
  unavailable: "시세 미제공",
};

// 심각(거래정지/정리매매/투자위험) → red, 주의성(관리/단기과열/투자주의/투자경고) → amber,
// 응답 축소 → 무채색. 상태 사실만 노출하고 원인 추정은 하지 않는다.
const CLASS_BY_KIND: Record<MarketActionStatus["kind"], string> = {
  suspended: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  liquidation: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  risk: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  managed: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  overheated: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  caution: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  unavailable: "bg-muted text-muted-foreground",
};

export const MarketActionBadge = ({ status }: MarketActionBadgeProps) => (
  <span
    className={`rounded px-2 py-0.5 text-caption font-medium ${CLASS_BY_KIND[status.kind]}`}
  >
    {LABEL_BY_KIND[status.kind]}
  </span>
);
