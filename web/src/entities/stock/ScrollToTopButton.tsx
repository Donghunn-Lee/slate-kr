"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE_TRANSITION =
  "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))";

export const ScrollToTopButton = () => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
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
      <div ref={sentinelRef} aria-hidden className="h-0" />
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
