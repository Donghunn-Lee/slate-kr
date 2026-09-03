"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeScrollAvailability,
  type ScrollAvailability,
} from "./scrollAvailability";

export type RankingTabItem<TId extends string> = {
  id: TId;
  label: string;
};

type Props<TId extends string> = {
  items: readonly RankingTabItem<TId>[];
  activeId: TId;
  onSelect: (id: TId) => void;
  className?: string;
};

export const RankingTabStrip = <TId extends string>({
  items,
  activeId,
  onSelect,
  className,
}: Props<TId>) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const [avail, setAvail] = useState<ScrollAvailability>({
    canLeft: false,
    canRight: false,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () =>
      setAvail(
        computeScrollAvailability(el.scrollLeft, el.scrollWidth, el.clientWidth),
      );
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    el.addEventListener("scroll", recompute, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", recompute);
    };
  }, []);

  // inline: "nearest" — 이미 보이는 탭이면 스크롤 없음, 가려진 탭만 살짝 진입.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const scrollByHalf = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.clientWidth / 2;
    el.scrollBy({ left: dir === "left" ? -delta : delta, behavior: "smooth" });
  };

  const chevronClass = cn(
    "hidden md:flex items-end pb-1.5 text-muted-foreground transition-colors",
    "hover:text-foreground disabled:cursor-default disabled:opacity-30",
    "disabled:hover:text-muted-foreground",
  );

  return (
    <div className={cn("flex min-w-0 flex-1 items-end", className)}>
      <button
        type="button"
        aria-label="이전 카테고리"
        onClick={() => scrollByHalf("left")}
        disabled={!avail.canLeft}
        className={chevronClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollRef}
          className="flex items-end gap-4 overflow-x-auto scrollbar-hide"
        >
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 pb-1.5 text-body-sm transition-colors",
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {avail.canLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-elevated to-transparent" />
        )}
        {avail.canRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-elevated to-transparent" />
        )}
      </div>
      <button
        type="button"
        aria-label="다음 카테고리"
        onClick={() => scrollByHalf("right")}
        disabled={!avail.canRight}
        className={chevronClass}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};
