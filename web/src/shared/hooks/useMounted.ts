"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// 마운트 가드 — 서버·hydration 렌더는 false, 클라 마운트 이후 true.
// 브라우저 전용 값(persist 스토어·resolvedTheme 등)을 hydration mismatch 없이 읽을 때 쓴다.
export const useMounted = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
