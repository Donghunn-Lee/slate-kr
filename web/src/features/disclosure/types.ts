export type PeriodPreset = "6M" | "1Y" | "3Y" | "5Y" | "ALL" | "CUSTOM";

export const PERIOD_PRESETS: PeriodPreset[] = ["6M", "1Y", "3Y", "5Y", "ALL", "CUSTOM"];

export const isPeriodPreset = (value: unknown): value is PeriodPreset =>
  typeof value === "string" && (PERIOD_PRESETS as string[]).includes(value);
