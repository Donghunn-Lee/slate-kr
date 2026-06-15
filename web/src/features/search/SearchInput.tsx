"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStockSearch } from "./useStockSearch";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (ticker: string, name: string) => void;
  disabled?: boolean;
};

export const SearchInput = ({ value, onChange, onSelect, disabled }: SearchInputProps) => {
  const router = useRouter();
  const { results, isLoading, error } = useStockSearch(value);
  const [closedByUser, setClosedByUser] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isOpen = !closedByUser && !error && (isLoading || results.length > 0);

  const containerRef = useRef<HTMLDivElement>(null);

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
    router.push(`/stocks/${ticker}`);
  };

  const handleSearchNavigate = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
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
    <div ref={containerRef} className="relative flex gap-2">
      <div className="relative flex-1">
        <Input
          type="text"
          placeholder="종목명 또는 종목코드 검색"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-full"
          autoComplete="off"
        />
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
      <Button onClick={handleSearchNavigate} disabled={disabled}>
        검색
      </Button>
    </div>
  );
};
