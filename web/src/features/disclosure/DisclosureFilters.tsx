"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { PeriodPreset } from "./types";

type DisclosureFiltersProps = {
  ticker: string;
  currentPreset: PeriodPreset;
  currentBgnDate?: string;
  currentEndDate?: string;
  currentQuery: string;
};

const PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "6M", label: "6개월" },
  { value: "1Y", label: "1년" },
  { value: "3Y", label: "3년" },
  { value: "5Y", label: "5년" },
  { value: "ALL", label: "전체" },
  { value: "CUSTOM", label: "직접 선택" },
];

const toYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseYmd = (value?: string): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export const DisclosureFilters = ({
  ticker,
  currentPreset,
  currentBgnDate,
  currentEndDate,
  currentQuery,
}: DisclosureFiltersProps) => {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(currentQuery);
  const [customBgn, setCustomBgn] = useState<Date | undefined>(
    parseYmd(currentBgnDate),
  );
  const [customEnd, setCustomEnd] = useState<Date | undefined>(
    parseYmd(currentEndDate),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedQuery = useRef(currentQuery);

  useEffect(() => {
    setQueryInput(currentQuery);
    lastPushedQuery.current = currentQuery;
  }, [currentQuery]);

  useEffect(() => {
    setCustomBgn(parseYmd(currentBgnDate));
    setCustomEnd(parseYmd(currentEndDate));
  }, [currentBgnDate, currentEndDate]);

  const buildUrl = useCallback(
    (params: {
      preset: PeriodPreset;
      bgn?: string;
      end?: string;
      q?: string;
    }) => {
      const sp = new URLSearchParams();
      sp.set("preset", params.preset);
      if (params.preset === "CUSTOM") {
        if (params.bgn) sp.set("bgn", params.bgn);
        if (params.end) sp.set("end", params.end);
      }
      if (params.q) sp.set("q", params.q);
      sp.set("page", "1");
      return `/stocks/${ticker}/disclosures?${sp.toString()}`;
    },
    [ticker],
  );

  const handlePresetChange = (value: string) => {
    if (!value || value === currentPreset) return;
    const preset = value as PeriodPreset;
    if (preset === "CUSTOM") {
      // wait for both dates before navigating
      return;
    }
    router.push(
      buildUrl({ preset, q: queryInput.trim() || undefined }),
      { scroll: false },
    );
  };

  const handleCustomApply = (next: { bgn?: Date; end?: Date }) => {
    if (!next.bgn || !next.end) return;
    router.push(
      buildUrl({
        preset: "CUSTOM",
        bgn: toYmd(next.bgn),
        end: toYmd(next.end),
        q: queryInput.trim() || undefined,
      }),
      { scroll: false },
    );
  };

  const handleQueryChange = (next: string) => {
    setQueryInput(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = next.trim();
      if (trimmed === lastPushedQuery.current) return;
      lastPushedQuery.current = trimmed;
      router.push(
        buildUrl({
          preset: currentPreset,
          bgn: currentBgnDate,
          end: currentEndDate,
          q: trimmed || undefined,
        }),
        { scroll: false },
      );
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showCustomPickers = currentPreset === "CUSTOM";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={currentPreset}
          onValueChange={handlePresetChange}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {PRESET_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              aria-label={opt.label}
              className="border-amber-border bg-transparent text-secondary-foreground hover:bg-amber-border/40 hover:text-foreground data-[state=on]:bg-elevated data-[state=on]:text-foreground"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {showCustomPickers && (
          <div className="flex items-center gap-1">
            <DatePickerPopover
              label="시작일"
              value={customBgn}
              max={customEnd}
              onSelect={(d) => {
                setCustomBgn(d);
                handleCustomApply({ bgn: d, end: customEnd });
              }}
            />
            <span className="text-xs text-muted-foreground">~</span>
            <DatePickerPopover
              label="끝일"
              value={customEnd}
              min={customBgn}
              onSelect={(d) => {
                setCustomEnd(d);
                handleCustomApply({ bgn: customBgn, end: d });
              }}
            />
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="공시 제목 검색"
          value={queryInput}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="h-8 border-amber-border bg-elevated/80 pl-8 sm:w-56"
        />
      </div>
    </div>
  );
};

type DatePickerPopoverProps = {
  label: string;
  value?: Date;
  min?: Date;
  max?: Date;
  onSelect: (date: Date | undefined) => void;
};

const DatePickerPopover = ({
  label,
  value,
  min,
  max,
  onSelect,
}: DatePickerPopoverProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 border-amber-border bg-elevated/80 px-2.5 text-xs font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value ? toYmd(value) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto bg-elevated p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value ?? max ?? min}
          disabled={(date) => {
            if (min && date < min) return true;
            if (max && date > max) return true;
            return false;
          }}
          onSelect={(d) => {
            onSelect(d);
            if (d) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
