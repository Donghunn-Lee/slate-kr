import { DisclosureType } from "@/shared/utils/classifyDisclosure";

export type PeriodPreset = "6M" | "1Y" | "3Y" | "5Y" | "ALL" | "CUSTOM";

export const PERIOD_PRESETS: PeriodPreset[] = ["6M", "1Y", "3Y", "5Y", "ALL", "CUSTOM"];

export const isPeriodPreset = (value: unknown): value is PeriodPreset =>
  typeof value === "string" && (PERIOD_PRESETS as string[]).includes(value);

export type DisclosureFilterType = DisclosureType | "UNCATEGORIZED";

const DISCLOSURE_FILTER_TYPES: DisclosureFilterType[] = [
  ...(Object.values(DisclosureType) as DisclosureType[]),
  "UNCATEGORIZED",
];

export const isDisclosureFilterType = (value: unknown): value is DisclosureFilterType =>
  typeof value === "string" && (DISCLOSURE_FILTER_TYPES as string[]).includes(value);
