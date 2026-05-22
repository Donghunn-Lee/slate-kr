"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SearchResult = {
  ticker: string;
  name: string;
  market: string;
};

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (ticker: string, name: string) => void;
  disabled?: boolean;
};

export const SearchInput = ({ value, onChange, onSelect, disabled }: SearchInputProps) => {
  const router = useRouter();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const search = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsOpen(true);
    setResults([]);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResult[] = await res.json();
      setResults(data);
      setIsLoading(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setIsOpen(false);
      setIsLoading(false);
      toast.error("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  }, []);

  const handleChange = (newValue: string) => {
    onChange(newValue);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (newValue.trim() === "") {
      if (abortRef.current) abortRef.current.abort();
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      search(newValue.trim());
    }, 300);
  };

  const handleSelect = (ticker: string, name: string) => {
    setIsOpen(false);
    setResults([]);
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
          setIsOpen(false);
          handleSearchNavigate();
        }
        break;
      case "Escape":
        setIsOpen(false);
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
