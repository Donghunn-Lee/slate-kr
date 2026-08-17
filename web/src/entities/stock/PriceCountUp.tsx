"use client";

import { useState, useEffect, useRef } from "react";
import { getTickSize } from "@/lib/getTickSize";

type PriceCountUpProps = {
  value: number;
  duration?: number;
  className?: string;
};

// 마운트 시 value 를 정적으로 표시. 이후 value 변경 시에만 이전 표시값에서 새 값으로
// ease-out cubic 애니. 다른 대상의 값을 보여줘야 하는 위치(예: 지수 탭 pane)에서는
// 호출부가 key 로 remount 시켜 정적 리셋을 강제한다.
export const PriceCountUp = ({ value, duration = 800, className }: PriceCountUpProps) => {
  const [displayed, setDisplayed] = useState(value);
  // "실제 화면에 반영된 값"을 추적. Strict Mode 의 effect 이중 실행으로 첫 RAF 가 취소되어도
  // setDisplayed 가 발화되지 않았으면 ref 도 그대로라 두 번째 라운드에서 애니가 정상 시작된다.
  const displayedRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const source = displayedRef.current;
    // 마운트 직후: source(useState 초기값 = value) === value → early return 으로 정적 유지.
    // value 변경 시에만 diff 가 생겨 애니가 시작된다.
    if (source === value) return;

    const tickSize = getTickSize(value);
    const diff = value - source;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const snapped = source + Math.round((eased * diff) / tickSize) * tickSize;
      const clamped = diff > 0 ? Math.min(snapped, value) : Math.max(snapped, value);
      displayedRef.current = clamped;
      setDisplayed(clamped);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = value;
        setDisplayed(value);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{displayed.toLocaleString("ko-KR")}</span>;
};
