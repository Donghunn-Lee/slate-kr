"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStockSearch } from "./useStockSearch";

const DEFAULT_PLACEHOLDER = "종목명 또는 종목코드 검색";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (ticker: string, name: string) => void;
  onNavigate?: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "lg";
  placeholder?: string;
  autoFocus?: boolean;
};

export const SearchInput = ({
  value,
  onChange,
  onSelect,
  onNavigate,
  disabled,
  size = "default",
  placeholder = DEFAULT_PLACEHOLDER,
  autoFocus = false,
}: SearchInputProps) => {
  const router = useRouter();
  const { results, isLoading, error } = useStockSearch(value);
  const [closedByUser, setClosedByUser] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isOpen = !closedByUser && !error && (isLoading || results.length > 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setClosedByUser(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleChange = (newValue: string) => {
    onChange(newValue);
    setActiveIndex(-1);
    setClosedByUser(false);
  };

  const handleSelect = (ticker: string, name: string) => {
    setClosedByUser(true);
    setActiveIndex(-1);
    onSelect?.(ticker, name);
    inputRef.current?.blur();
    router.push(`/stocks/${ticker}`);
    onNavigate?.();
  };

  const handleSearchNavigate = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setClosedByUser(true);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onNavigate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "Enter") handleSearchNavigate();
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          handleSelect(results[activeIndex].ticker, results[activeIndex].name);
        } else {
          setClosedByUser(true);
          handleSearchNavigate();
        }
        break;
      case "Escape":
        setClosedByUser(true);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative flex">
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            "w-full pr-9",
            size === "sm" && "h-8 text-sm md:text-sm",
            size === "lg" && "h-12 text-base md:text-base"
          )}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={handleSearchNavigate}
          disabled={disabled || !value.trim()}
          aria-label="검색"
          className={cn(
            "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded",
            "text-muted-foreground transition-colors hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "sm" ? "size-6" : "size-7"
          )}
        >
          <Search className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
        </button>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
            {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">검색 중...</div>}
            {!isLoading && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">검색 결과가 없습니다</div>
            )}
            {!isLoading && results.length > 0 && (
              <ul role="listbox">
                {results.map((stock, index) => (
                  <li
                    key={stock.ticker}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`cursor-pointer px-4 py-2.5 transition-colors ${
                      index === activeIndex ? "bg-accent" : "hover:bg-accent"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(stock.ticker, stock.name);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{stock.name}</span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {stock.ticker}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{stock.market}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
