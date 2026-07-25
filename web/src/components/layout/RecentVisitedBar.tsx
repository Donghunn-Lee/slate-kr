"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { cn } from "@/lib/utils";

// 접힘 시 max-height. text-xs(1line ≈ 16px) + X 버튼 p-1(4px)로 실제 row 20px.
const COLLAPSED_HEIGHT_PX = 20;

// 헤더 하단에 매달린 패널. items=0 이면 미렌더.
// 레이아웃: [라벨 | chip 영역 | chevron] 3열 grid, items-start 로 라벨·chevron 은 상단 고정.
// chip 영역만 세로로 확장돼서 접힘/펼침 시 상단 정보(라벨) 는 자리에 그대로 남아있음.
export const RecentVisitedBar = () => {
  const router = useRouter();
  const items = useRecentVisitedStore((s) => s.items).slice(0, 20);
  const removeRecent = useRecentVisitedStore((s) => s.remove);
  const open = useRecentVisitedStore((s) => s.barOpen);
  const toggle = useRecentVisitedStore((s) => s.toggleBar);

  // 실제 chip 영역 자연 높이. max-height 전환의 target 값.
  const chipsRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const measure = () => setNaturalHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const goTo = (ticker: string) => router.push(`/stocks/${ticker}`);

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <div className="rounded-b-lg border border-t-0 border-border/60 bg-muted/40 shadow-sm">
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
          className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-1.5 select-none"
        >
          <div className="flex items-center gap-3 pt-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground/70">
              최근 조회
            </span>
            <span aria-hidden className="block h-3 w-px bg-border" />
          </div>
          <div
            id="recent-visited-list"
            className="overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none"
            style={{
              maxHeight: open ? naturalHeight : COLLAPSED_HEIGHT_PX,
            }}
          >
            <div
              ref={chipsRef}
              className="flex flex-wrap content-start gap-x-1.5 gap-y-1 text-xs"
            >
              {items.map((s) => (
                <span key={s.ticker} className="flex items-center">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(s.ticker);
                    }}
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    disabled={!open}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecent(s.ticker);
                    }}
                    aria-label={`${s.name} 최근 조회 삭제`}
                    className={cn(
                      "cursor-pointer p-1 text-muted-foreground/40 transition-opacity hover:text-foreground",
                      !open && "pointer-events-none opacity-0",
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </div>
      </div>
    </div>
  );
};
