import type { PeriodPreset } from "./types";

export type DateRange = {
  bgnDate?: Date;
  endDate?: Date;
};

const parseYmd = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const subtractMonths = (months: number): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
};

const subtractYears = (years: number): Date => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

export const resolveDateRange = (
  preset: PeriodPreset,
  bgn?: string,
  end?: string,
): DateRange => {
  switch (preset) {
    case "6M":
      return { bgnDate: subtractMonths(6) };
    case "1Y":
      return { bgnDate: subtractYears(1) };
    case "3Y":
      return { bgnDate: subtractYears(3) };
    case "5Y":
      return { bgnDate: subtractYears(5) };
    case "ALL":
      // DART requires bgn_de — without it, only today's disclosures are returned.
      // 1999-01-01 covers all DART history.
      return { bgnDate: new Date("1999-01-01T00:00:00") };
    case "CUSTOM": {
      const bgnDate = bgn ? parseYmd(bgn) : null;
      const endDate = end ? parseYmd(end) : null;
      if (!bgnDate || !endDate) return { bgnDate: subtractYears(1) };
      return { bgnDate, endDate };
    }
  }
};
