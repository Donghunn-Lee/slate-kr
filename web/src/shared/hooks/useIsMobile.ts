"use client";

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(width < 40rem)";

// Tailwind sm 브레이크 (< 640px) 감지. SSR-safe 서버 스냅샷은 false (데스크톱 가정) —
// 첫 페인트 후 마운트 시점에 실제 값으로 재렌더. 차트/legend 처럼 클라 전용 렌더에서만 사용.
export const useIsMobile = (): boolean =>
  useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
