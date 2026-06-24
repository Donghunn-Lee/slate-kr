"use client";

import { useState, useEffect, useRef } from "react";
import { getTickSize } from "@/lib/getTickSize";

type PriceCountUpProps = {
  from: number; // 마운트 시 초기 표시값. 이후 to 변경 시 직전 to에서 새 to로 애니메이션.
  to: number;
  duration?: number;
  className?: string;
};

export const PriceCountUp = ({ from, to, duration = 800, className }: PriceCountUpProps) => {
  const [displayed, setDisplayed] = useState(from);
  const prevToRef = useRef(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const source = prevToRef.current;
    prevToRef.current = to;
    if (source === to) return;

    const tickSize = getTickSize(to);
    const diff = to - source;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const snapped = source + Math.round((eased * diff) / tickSize) * tickSize;
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
  }, [to, duration]);

  return <span className={className}>{displayed.toLocaleString("ko-KR")}</span>;
};
