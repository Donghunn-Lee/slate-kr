import { DisclosureType } from "@/shared/utils/classifyDisclosure";

export const DISCLOSURE_TYPE_LABELS: Record<DisclosureType, string> = {
  MAJOR_EVENT: "주요사항",
  FINANCIAL: "정기보고서",
  OWNERSHIP: "소유상황",
  AUDIT: "감사",
  SHAREHOLDER_MEETING: "주주총회",
  MARKET_ACTION: "시장조치",
};

export const DISCLOSURE_TYPE_BADGE_CLASSES: Record<DisclosureType, string> = {
  MAJOR_EVENT: "bg-disclosure-major-event-bg text-disclosure-major-event-text",
  FINANCIAL: "bg-disclosure-financial-bg text-disclosure-financial-text",
  OWNERSHIP: "bg-disclosure-ownership-bg text-disclosure-ownership-text",
  AUDIT: "bg-disclosure-audit-bg text-disclosure-audit-text",
  SHAREHOLDER_MEETING:
    "bg-disclosure-shareholder-meeting-bg text-disclosure-shareholder-meeting-text",
  MARKET_ACTION: "bg-disclosure-market-action-bg text-disclosure-market-action-text",
};

// Static class strings required by Tailwind v4's class scanner — the `data-[state=on]:`
// prefix cannot be composed dynamically or the utility will be dropped from the bundle.
export const DISCLOSURE_TYPE_CHIP_ON_CLASSES: Record<DisclosureType, string> = {
  MAJOR_EVENT:
    "data-[state=on]:bg-disclosure-major-event-bg data-[state=on]:text-disclosure-major-event-text",
  FINANCIAL:
    "data-[state=on]:bg-disclosure-financial-bg data-[state=on]:text-disclosure-financial-text",
  OWNERSHIP:
    "data-[state=on]:bg-disclosure-ownership-bg data-[state=on]:text-disclosure-ownership-text",
  AUDIT:
    "data-[state=on]:bg-disclosure-audit-bg data-[state=on]:text-disclosure-audit-text",
  SHAREHOLDER_MEETING:
    "data-[state=on]:bg-disclosure-shareholder-meeting-bg data-[state=on]:text-disclosure-shareholder-meeting-text",
  MARKET_ACTION:
    "data-[state=on]:bg-disclosure-market-action-bg data-[state=on]:text-disclosure-market-action-text",
};

type CheckpointBadgeProps = {
  type: DisclosureType;
};

export const CheckpointBadge = ({ type }: CheckpointBadgeProps) => (
  <span
    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-current/30 px-1 py-0.5 text-[10px] font-medium md:px-1.5 md:text-xs ${DISCLOSURE_TYPE_BADGE_CLASSES[type]}`}
  >
    {DISCLOSURE_TYPE_LABELS[type]}
  </span>
);
