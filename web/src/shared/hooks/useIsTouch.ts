"use client";

import { useSyncExternalStore } from "react";

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

// hover 능력이 없는 포인터(터치 스크린) 감지. 뷰포트 폭 기준인 useIsMobile과는 다른 축 —
// 태블릿/폴더블처럼 넓지만 터치인 기기, 좁지만 마우스 페어링된 기기를 정확히 구분한다.
// SSR-safe: 서버는 false(hover 가능 가정), 마운트 후 실제 값으로 재렌더.
export const useIsTouch = (): boolean =>
  useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia(TOUCH_QUERY);
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false,
  );
