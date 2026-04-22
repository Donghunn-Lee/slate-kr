import { Badge, type badgeVariants } from "@/components/ui/badge";
import { DisclosureType } from "@/shared/utils/classifyDisclosure";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const BADGE_CONFIG: Record<DisclosureType, { label: string; variant: BadgeVariant }> = {
  MAJOR_EVENT: { label: "주요사항", variant: "red" },
  FINANCIAL: { label: "정기보고서", variant: "blue" },
  OWNERSHIP: { label: "소유상황", variant: "purple" },
  AUDIT: { label: "감사", variant: "teal" },
  SHAREHOLDER_MEETING: { label: "주주총회", variant: "amber" },
};

type CheckpointBadgeProps = {
  type: DisclosureType;
};

export const CheckpointBadge = ({ type }: CheckpointBadgeProps) => {
  const { label, variant } = BADGE_CONFIG[type];
  return <Badge variant={variant}>{label}</Badge>;
};
