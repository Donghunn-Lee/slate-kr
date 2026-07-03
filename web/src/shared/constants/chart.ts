// KR 관행: 상승=레드, 하락=블루. Tailwind red-600/blue-600 톤으로 globals.css의 oklch와 매칭.
// dim.{up,down} — 전일 봉 등 흐림 처리용 저채도 저대비 버전. 무채색 계열과 톤 충돌 없도록
// 원색의 알파를 낮춰 배경에 자연스레 녹아들게 한다.
export const CHART_THEME = {
  light: {
    bg: "#ffffff",
    text: "#1a1a1a",
    border: "#e5e5e5",
    up: "#dc2626",
    down: "#2563eb",
    dim: {
      up: "rgba(220,38,38,0.28)",
      down: "rgba(37,99,235,0.28)",
    },
  },
  dark: {
    bg: "#1a1a1a",
    text: "#f0f0f0",
    border: "rgba(255,255,255,0.1)",
    up: "#ef4444",
    down: "#3b82f6",
    dim: {
      up: "rgba(239,68,68,0.35)",
      down: "rgba(59,130,246,0.35)",
    },
  },
} as const;

export type ChartPalette = (typeof CHART_THEME)[keyof typeof CHART_THEME];

// intraday 잠금 뷰: 전일 마지막 세션 봉을 좌측에 흐리게 걸치는 여유. 3600s = 6개 10분봉.
export const INTRADAY_PREV_LOOKBACK_SEC = 3600;
