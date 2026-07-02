// KR 관행: 상승=레드, 하락=블루. Tailwind red-600/blue-600 톤으로 globals.css의 oklch와 매칭.
export const CHART_THEME = {
  light: {
    bg: "#ffffff",
    text: "#1a1a1a",
    border: "#e5e5e5",
    up: "#dc2626",
    down: "#2563eb",
  },
  dark: {
    bg: "#1a1a1a",
    text: "#f0f0f0",
    border: "rgba(255,255,255,0.1)",
    up: "#ef4444",
    down: "#3b82f6",
  },
} as const;

export type ChartPalette = (typeof CHART_THEME)[keyof typeof CHART_THEME];
