"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { cn } from "@/lib/utils";

// 헤더 하단 전역 collapsible 바. 항목이 없으면 아예 렌더 안 됨.
// SSR 초기 items 는 [], 클라이언트 hydration 이후 persist 로부터 채워짐.
// 두 시점 모두 items.length === 0 이면 null 이라 hydration mismatch 는 발생하지 않음.
export const RecentVisitedBar = () => {
  const router = useRouter();
  const items = useRecentVisitedStore((s) => s.items).slice(0, 10);
  const removeRecent = useRecentVisitedStore((s) => s.remove);
  const open = useRecentVisitedStore((s) => s.barOpen);
  const toggle = useRecentVisitedStore((s) => s.toggleBar);

  if (items.length === 0) return null;

  return (
    <div className="border-b border-border/40 bg-muted/40">
      <div className="mx-auto max-w-5xl px-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="recent-visited-list"
          className="flex h-8 w-full cursor-pointer items-center justify-between text-[11px] font-medium tracking-wide text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          <span>최근 조회</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        {open && (
          <div
            id="recent-visited-list"
            className="flex flex-wrap content-start gap-x-3 gap-y-1 pb-3 text-xs"
          >
            {items.map((s) => (
              <span key={s.ticker} className="flex items-center">
                <button
                  onClick={() => router.push(`/stocks/${s.ticker}`)}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => removeRecent(s.ticker)}
                  aria-label={`${s.name} 최근 조회 삭제`}
                  className="cursor-pointer p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
