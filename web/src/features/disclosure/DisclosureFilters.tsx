"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { DisclosureType } from "@/shared/utils/classifyDisclosure";
import {
  DISCLOSURE_TYPE_CHIP_ON_CLASSES,
  DISCLOSURE_TYPE_LABELS,
} from "@/entities/stock/CheckpointBadge";
import { isDisclosureFilterType, type DisclosureFilterType, type PeriodPreset } from "./types";

type DisclosureFiltersProps = {
  ticker: string;
  currentPreset: PeriodPreset;
  currentBgnDate?: string;
  currentEndDate?: string;
  currentQuery: string;
  currentTypes: DisclosureFilterType[];
};

type ChipOption = { value: DisclosureFilterType; label: string; onClass: string };

const CHIP_OPTIONS: ChipOption[] = [
  ...(Object.keys(DISCLOSURE_TYPE_LABELS) as DisclosureType[]).map((type) => ({
    value: type as DisclosureFilterType,
    label: DISCLOSURE_TYPE_LABELS[type],
    onClass: DISCLOSURE_TYPE_CHIP_ON_CLASSES[type],
  })),
  {
    value: "UNCATEGORIZED",
    label: "기타",
    onClass:
      "data-[state=on]:bg-disclosure-uncategorized-bg data-[state=on]:text-disclosure-uncategorized-text",
  },
];

const PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "6M", label: "6개월" },
  { value: "1Y", label: "1년" },
  { value: "3Y", label: "3년" },
  { value: "5Y", label: "5년" },
  { value: "ALL", label: "전체" },
  { value: "CUSTOM", label: "직접 입력" },
];

const DEFAULT_PRESET: PeriodPreset = "1Y";

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

// Auto-insert hyphens as user types: "20260531" -> "2026-05-31"
const formatDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

// Strict YYYY-MM-DD parser that rejects out-of-range or normalized dates (e.g., Feb 30)
const parseInputToDate = (formatted: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formatted);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
};

export const DisclosureFilters = ({
  ticker,
  currentPreset,
  currentBgnDate,
  currentEndDate,
  currentQuery,
  currentTypes,
}: DisclosureFiltersProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [queryInput, setQueryInput] = useState(currentQuery);
  const [pendingTypes, setPendingTypes] = useState<DisclosureFilterType[]>(currentTypes);
  const [customBgn, setCustomBgn] = useState<Date | undefined>(parseYmd(currentBgnDate));
  const [customEnd, setCustomEnd] = useState<Date | undefined>(parseYmd(currentEndDate));
  const [customMode, setCustomMode] = useState(currentPreset === "CUSTOM");

  // Render-time prop sync — keeps local state aligned with URL changes
  // without the cascading-render warning that useEffect-based sync triggers.
  // types is stringified because the prop is a fresh array each render.
  const currentTypesKey = currentTypes.join(",");
  const [prevUrl, setPrevUrl] = useState({
    preset: currentPreset,
    query: currentQuery,
    bgn: currentBgnDate,
    end: currentEndDate,
    typesKey: currentTypesKey,
  });
  if (
    prevUrl.preset !== currentPreset ||
    prevUrl.query !== currentQuery ||
    prevUrl.bgn !== currentBgnDate ||
    prevUrl.end !== currentEndDate ||
    prevUrl.typesKey !== currentTypesKey
  ) {
    setPrevUrl({
      preset: currentPreset,
      query: currentQuery,
      bgn: currentBgnDate,
      end: currentEndDate,
      typesKey: currentTypesKey,
    });
    setQueryInput(currentQuery);
    setPendingTypes(currentTypes);
    setCustomBgn(parseYmd(currentBgnDate));
    setCustomEnd(parseYmd(currentEndDate));
    setCustomMode(currentPreset === "CUSTOM");
  }

  const buildUrl = useCallback(
    (params: {
      preset: PeriodPreset;
      bgn?: string;
      end?: string;
      q?: string;
      types: DisclosureFilterType[];
    }) => {
      const sp = new URLSearchParams();
      sp.set("preset", params.preset);
      if (params.preset === "CUSTOM") {
        if (params.bgn) sp.set("bgn", params.bgn);
        if (params.end) sp.set("end", params.end);
      }
      if (params.q) sp.set("q", params.q);
      if (params.types.length > 0) sp.set("types", params.types.join(","));
      sp.set("page", "1");
      return `/stocks/${ticker}/disclosures?${sp.toString()}`;
    },
    [ticker]
  );

  const navigate = useCallback(
    (url: string) => {
      startTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [router]
  );

  // Single commit path used by the search button, Enter key, and Apply button.
  // Snapshots queryInput + pendingTypes together onto the current preset/dates.
  const commit = useCallback(() => {
    navigate(
      buildUrl({
        preset: currentPreset,
        bgn: currentBgnDate,
        end: currentEndDate,
        q: queryInput.trim() || undefined,
        types: pendingTypes,
      })
    );
  }, [navigate, buildUrl, currentPreset, currentBgnDate, currentEndDate, queryInput, pendingTypes]);

  const handlePresetChange = (value: string) => {
    if (!value) return;
    const preset = value as PeriodPreset;
    if (preset === "CUSTOM") {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    if (preset === currentPreset) return;
    navigate(buildUrl({ preset, q: queryInput.trim() || undefined, types: pendingTypes }));
  };

  const handleCustomApply = (next: { bgn?: Date; end?: Date }) => {
    if (!next.bgn || !next.end) return;
    navigate(
      buildUrl({
        preset: "CUSTOM",
        bgn: toYmd(next.bgn),
        end: toYmd(next.end),
        q: queryInput.trim() || undefined,
        types: pendingTypes,
      })
    );
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  const handleTypesChange = (values: string[]) => {
    setPendingTypes(values.filter(isDisclosureFilterType));
  };

  const handleReset = () => {
    setQueryInput("");
    setPendingTypes([]);
    setCustomBgn(undefined);
    setCustomEnd(undefined);
    setCustomMode(false);
    navigate(buildUrl({ preset: DEFAULT_PRESET, types: [] }));
  };

  const showCustomPickers = customMode;
  const displayPreset: PeriodPreset = customMode ? "CUSTOM" : currentPreset;
  const applyDisabled = pendingTypes.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={displayPreset}
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
                className="h-7 border-sky-border bg-sky-border/30 px-2 text-xs text-secondary-foreground hover:bg-sky-border/40 hover:text-foreground data-[state=on]:bg-elevated data-[state=on]:text-foreground"
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

        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="공시 제목 검색"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={handleQueryKeyDown}
              className="h-7 border-sky-border bg-elevated/80 pl-7 text-xs sm:w-56"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={commit}
            aria-label="검색"
            className="h-7 px-2 text-xs"
          >
            검색
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 transition-opacity",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        <ToggleGroup
          type="multiple"
          value={pendingTypes}
          onValueChange={handleTypesChange}
          variant="outline"
          size="sm"
          className="flex-wrap justify-start"
        >
          {CHIP_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              aria-label={opt.label}
              className={cn(
                "h-7 border-sky-border bg-sky-border/30 px-2 text-xs text-secondary-foreground hover:bg-sky-border/40 hover:text-foreground",
                opt.onClass,
              )}
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={commit}
            disabled={applyDisabled}
            aria-label="필터 적용"
            className="h-7 bg-sky-accent px-2.5 text-xs hover:bg-sky-accent/85 disabled:bg-transparent disabled:border-sky-accent/50 disabled:text-muted-foreground disabled:opacity-100"
          >
            적용
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            aria-label="필터 초기화"
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="size-3" />
            초기화
          </Button>
        </div>
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

const DatePickerPopover = ({ label, value, min, max, onSelect }: DatePickerPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value ? toYmd(value) : "");
  const [prevValue, setPrevValue] = useState(value);

  // Sync input text when parent value changes (URL navigation, calendar pick)
  if (prevValue !== value) {
    setPrevValue(value);
    setInputValue(value ? toYmd(value) : "");
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    setInputValue(formatted);

    if (formatted === "") {
      onSelect(undefined);
      return;
    }

    const date = parseInputToDate(formatted);
    if (!date) return;
    if (min && date < min) return;
    if (max && date > max) return;
    onSelect(date);
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (d) {
      setInputValue(toYmd(d));
      setOpen(false);
    } else {
      setInputValue("");
    }
    onSelect(d);
  };

  return (
    <div className="relative">
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="0000-00-00"
        maxLength={10}
        aria-label={label}
        inputMode="numeric"
        className="h-7 w-28 border-sky-border bg-elevated/80 pr-6 text-xs font-normal"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label} 달력 열기`}
            className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-sky-border/40 hover:text-foreground"
          >
            <CalendarIcon className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto bg-elevated p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value ?? max ?? min}
            disabled={(date) => {
              if (min && date < min) return true;
              if (max && date > max) return true;
              return false;
            }}
            onSelect={handleCalendarSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
