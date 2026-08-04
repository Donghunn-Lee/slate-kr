"use client";

import { useEffect } from "react";

// iOS Safari는 focus된 input의 실효 font-size가 16px 미만일 때 자동 확대(auto-zoom)를 실행한다.
// viewport meta 에 maximum-scale=1 을 추가하면 auto-zoom 만 억제되고 사용자 핀치 줌은 유지된다.
// Android/데스크톱에는 적용하지 않는다 — Android 는 maximum-scale=1 이면 핀치 줌 자체가 차단된다.
export const IosInputZoomFix = () => {
  useEffect(() => {
    // navigator.platform 은 deprecated 지만, iPadOS 13+ 가 데스크톱 UA 로 위장하는 경우를 판별할
    // 표준 대안이 Safari 에 아직 없어 유지. UA 문자열 우선 + iPad 위장 fallback.
    const ua = navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!isIos) return;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    if (/maximum-scale\s*=/.test(meta.content)) return;

    meta.content = `${meta.content}, maximum-scale=1`;
  }, []);

  return null;
};
