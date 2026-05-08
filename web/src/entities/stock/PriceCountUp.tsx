"use client";

import { useState, useEffect, useRef } from "react";
import { getTickSize } from "@/lib/getTickSize";

type PriceCountUpProps = {
  from: number;
  to: number;
  duration?: number;
  className?: string;
};

export const PriceCountUp = ({ from, to, duration = 800, className }: PriceCountUpProps) => {
  const [displayed, setDisplayed] = useState(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (from === to) return;

    const tickSize = getTickSize(to);
    const diff = to - from;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const snapped = from + Math.round((eased * diff) / tickSize) * tickSize;
      const clamped = diff > 0 ? Math.min(snapped, to) : Math.max(snapped, to);
      setDisplayed(clamped);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, duration]);

  return <span className={className}>{displayed.toLocaleString("ko-KR")}</span>;
};
