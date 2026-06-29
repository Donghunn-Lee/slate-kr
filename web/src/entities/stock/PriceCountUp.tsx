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
  // 직전 to가 아니라 "실제 화면에 반영된 값"을 추적한다. Strict Mode의 effect 이중 실행으로
  // 첫 RAF가 취소되더라도, 그동안 setDisplayed가 발화되지 않았으면 ref도 그대로라 두 번째
  // 라운드에서 애니메이션이 정상 시작된다.
  const displayedRef = useRef(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const source = displayedRef.current;
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
      displayedRef.current = clamped;
      setDisplayed(clamped);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = to;
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
