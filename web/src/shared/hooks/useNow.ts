"use client";

import { useEffect, useState } from "react";

// 매 분 tick 하는 client clock. null = pre-mount (SSR hydration mismatch 회피).
// 세션 경계(15:30·09:00 등)를 넘길 때 소비 라벨이 자동 갱신되도록 항상 tick.
export const useNow = (): Date | null => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);
  return now;
};
