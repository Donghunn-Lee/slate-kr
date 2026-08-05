"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { cn } from "@/lib/utils";

// 접힘 시 max-height. text-caption(모바일 11 / 데스크톱 12, lh 1.4 → ≈16px) + X 버튼 p-1(4px) 로 실제 row 20px.
const COLLAPSED_HEIGHT_PX = 20;

// 모바일 펼침 최대 높이. 칩 행(≈20px) + gap-y(4px) 기준 2행 완전 노출(44px) + 3행 상단 ≈8px peek
// → 스크롤 단서 확보. 실기기 렌더 폰트 메트릭에 따라 미세 조정 여지.
const EXPANDED_CAP_MOBILE_PX = 56;

// 헤더 하단에 매달린 패널. items=0 이면 미렌더.
// 레이아웃: [라벨 | chip 영역 | chevron] 3열 grid, items-start 로 라벨·chevron 은 상단 고정.
// chip 영역만 세로로 확장돼서 접힘/펼침 시 상단 정보(라벨) 는 자리에 그대로 남아있음.
export const RecentVisitedBar = () => {
  const router = useRouter();
  const items = useRecentVisitedStore((s) => s.items).slice(0, 20);
  const removeRecent = useRecentVisitedStore((s) => s.remove);
  const open = useRecentVisitedStore((s) => s.barOpen);
  const toggle = useRecentVisitedStore((s) => s.toggleBar);
  const isMobile = useIsMobile();

  // 실제 chip 영역 자연 높이. max-height 전환의 target 값.
  const chipsRef = useRef<HTMLDivElement>(null);
  // 모바일 캡으로 인해 내부 스크롤이 생기는 컨테이너. 닫힘 시 scrollTop 리셋 대상.
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // 닫힘 전환 시 내부 스크롤 위치 리셋 — 재열림 시 첫 행부터 노출 보장.
  // 접힘 애니메이션(200ms) 개시 직전 동기 리셋: overflow-hidden 으로 클리핑되기 전
  // 스크롤이 원위치라야 접힘 20px 창이 최상단 라벨 라인을 보여준다.
  useEffect(() => {
    if (!open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open]);

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
            <span className="text-micro font-semibold tracking-wide text-muted-foreground/70">
              최근 조회
            </span>
            <span aria-hidden className="block h-3 w-px bg-border" />
          </div>
          <div
            id="recent-visited-list"
            ref={scrollRef}
            className={cn(
              "transition-[max-height] duration-200 ease-out motion-reduce:transition-none",
              open && isMobile
                ? "overflow-y-auto overscroll-contain"
                : "overflow-hidden",
            )}
            style={{
              maxHeight: open
                ? isMobile
                  ? Math.min(naturalHeight, EXPANDED_CAP_MOBILE_PX)
                  : naturalHeight
                : COLLAPSED_HEIGHT_PX,
            }}
          >
            <div
              ref={chipsRef}
              className="flex flex-wrap content-start gap-x-1 gap-y-1 text-micro sm:gap-x-1.5 sm:text-caption"
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
                      "-ml-1 inline-flex cursor-pointer items-center justify-center p-[5px] text-muted-foreground/40 transition-opacity hover:text-foreground sm:ml-0 sm:p-1",
                      !open && "pointer-events-none opacity-0",
                    )}
                  >
                    <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
