import { DisclosureType } from "@/shared/utils/classifyDisclosure";

const TYPE_CLASSES: Record<DisclosureType, string> = {
  MAJOR_EVENT: "bg-disclosure-major-event-bg text-disclosure-major-event-text",
  FINANCIAL: "bg-disclosure-financial-bg text-disclosure-financial-text",
  OWNERSHIP: "bg-disclosure-ownership-bg text-disclosure-ownership-text",
  AUDIT: "bg-disclosure-audit-bg text-disclosure-audit-text",
  SHAREHOLDER_MEETING:
    "bg-disclosure-shareholder-meeting-bg text-disclosure-shareholder-meeting-text",
};

const TYPE_LABELS: Record<DisclosureType, string> = {
  MAJOR_EVENT: "주요사항",
  FINANCIAL: "정기보고서",
  OWNERSHIP: "소유상황",
  AUDIT: "감사",
  SHAREHOLDER_MEETING: "주주총회",
};

type CheckpointBadgeProps = {
  type: DisclosureType;
};

export const CheckpointBadge = ({ type }: CheckpointBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${TYPE_CLASSES[type]}`}
  >
    {TYPE_LABELS[type]}
  </span>
);
