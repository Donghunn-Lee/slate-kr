"use client";

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(width < 40rem)";
const BELOW_MD_QUERY = "(width < 48rem)";

const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

// Tailwind sm 브레이크 (< 640px) 감지. SSR-safe 서버 스냅샷은 false (데스크톱 가정) —
// 첫 페인트 후 마운트 시점에 실제 값으로 재렌더. 차트/legend 처럼 클라 전용 렌더에서만 사용.
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);

// Tailwind md 브레이크 (< 768px) 감지. md: 클래스로 레이아웃을 가르는 트리가 JS 옵션
// (차트 축 등)을 같은 분기점에 맞출 때 사용. SSR 스냅샷 규약은 useIsMobile 과 동일.
export const useIsBelowMd = (): boolean => useMediaQuery(BELOW_MD_QUERY);
