"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { cn } from "@/lib/utils";

// 헤더 하단에 매달린 패널. items=0 이면 미렌더.
// SSR items=[] → 초기 렌더 null, hydration 이후 persist 복원되면 노출. 두 시점 모두 null 이라
// hydration mismatch 없음.
export const RecentVisitedBar = () => {
  const router = useRouter();
  const items = useRecentVisitedStore((s) => s.items).slice(0, 10);
  const removeRecent = useRecentVisitedStore((s) => s.remove);
  const open = useRecentVisitedStore((s) => s.barOpen);
  const toggle = useRecentVisitedStore((s) => s.toggleBar);

  // 접힘 프리뷰가 1줄에 다 들어가면 fade 마스크 미적용.
  const previewRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || open) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, open]);

  if (items.length === 0) return null;

  const goTo = (ticker: string) => router.push(`/stocks/${ticker}`);

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <div className="rounded-b-lg border border-t-0 border-border/60 bg-muted/40 shadow-sm">
        {/* Header row: 라벨 + (접힘: 인라인 프리뷰) + chevron. div+role="button" 로
            래핑해 내부 chip 버튼과 nested-button 이 되지 않도록. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-controls="recent-visited-list"
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
          className="flex h-8 cursor-pointer items-center gap-3 px-3 select-none"
        >
          <span className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground/80">
            최근 조회
          </span>
          <div className="relative min-w-0 flex-1">
            {!open && (
              <div
                ref={previewRef}
                className={cn(
                  "flex flex-nowrap items-center gap-3 overflow-hidden text-xs",
                  overflow &&
                    "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]",
                )}
              >
                {items.map((s) => (
                  <button
                    key={s.ticker}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(s.ticker);
                    }}
                    className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </div>
        {/* Expanded body: grid-rows 0fr/1fr trick 로 height transition. */}
        <div
          id="recent-visited-list"
          aria-hidden={!open}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap content-start gap-x-3 gap-y-1 px-3 pt-1 pb-3 text-xs">
              {items.map((s) => (
                <span key={s.ticker} className="flex items-center">
                  <button
                    onClick={() => goTo(s.ticker)}
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
          </div>
        </div>
      </div>
    </div>
  );
};
