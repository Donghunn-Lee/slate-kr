"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE_TRANSITION =
  "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))";

// 문서 상단에서 이만큼 내려간 뒤에만 표시 — 페이지 구조와 무관한 단일 임계.
const SHOW_AFTER_PX = 600;

export const ScrollToTopButton = () => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // 문서 최상단 sentinel 을 root 위쪽을 SHOW_AFTER_PX 늘려 관찰 — 그 거리를 지나 스크롤해야
    // 교차가 끊긴다. top < 0 조건으로 sentinel 이 위로 지나간 경우만 표시한다.
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: `${SHOW_AFTER_PX}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0" />
      <button
        type="button"
        onClick={handleClick}
        aria-label="맨 위로"
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        style={{ transition: FADE_TRANSITION }}
        className={cn(
          "fixed right-4 z-40 flex size-11 items-center justify-center rounded-full",
          "bg-elevated border border-default shadow-slate text-foreground",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:bottom-[max(1rem,env(safe-area-inset-bottom))]",
          "hover:shadow-slate-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
};
