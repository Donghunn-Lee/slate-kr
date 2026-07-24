// KR 관행: 상승=레드, 하락=블루. Tailwind red-600/blue-600 톤으로 globals.css의 oklch와 매칭.
// dim.{up,down} — 전일 봉 등 흐림 처리용 저채도 저대비 버전. 무채색 계열과 톤 충돌 없도록
// 원색의 알파를 낮춰 배경에 자연스레 녹아들게 한다.
// volume.{up,down} — 하단 histogram 오버레이용. 반투명이 관례이므로 원색 alpha 를 더 낮춘다.
// baseline.{top,bottom}Fill{1,2} — intraday 선차트(BaselineSeries) 영역 그라데이션.
// fill1(진함) → fill2(옅음) 로 baseline 에 가까워질수록 소멸. 렌더 확인 후 알파 미세조정 여지.
// neutralLine / neutralTopFill / neutralBottomFill — baseline 개념 부재 뷰(EOD·주·월 선차트) 용
// AreaSeries 무채색. IndexSparkline flat 톤과 동일 계열. 알파 0.18 → 0.02 그라데이션.
// ma[] — 이동평균선 팔레트. period index 로 매핑, 초과 시 modulo 순환. 캔들 red/blue 와
// 톤 충돌 없이 서로 구분되도록 노랑·보라·청록·주황 계열 (KR 일봉 차트 관행에 근접).
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
    volume: {
      up: "rgba(220,38,38,0.35)",
      down: "rgba(37,99,235,0.35)",
    },
    baseline: {
      topFill1: "rgba(220,38,38,0.28)",
      topFill2: "rgba(220,38,38,0.05)",
      bottomFill1: "rgba(37,99,235,0.28)",
      bottomFill2: "rgba(37,99,235,0.05)",
    },
    neutralLine: "#525252",
    neutralTopFill: "rgba(82,82,82,0.18)",
    neutralBottomFill: "rgba(82,82,82,0.02)",
    ma: ["#eab308", "#a855f7", "#14b8a6", "#f97316"],
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
    volume: {
      up: "rgba(239,68,68,0.45)",
      down: "rgba(59,130,246,0.45)",
    },
    baseline: {
      topFill1: "rgba(239,68,68,0.28)",
      topFill2: "rgba(239,68,68,0.05)",
      bottomFill1: "rgba(59,130,246,0.28)",
      bottomFill2: "rgba(59,130,246,0.05)",
    },
    neutralLine: "#a3a3a3",
    neutralTopFill: "rgba(163,163,163,0.18)",
    neutralBottomFill: "rgba(163,163,163,0.02)",
    ma: ["#facc15", "#c084fc", "#2dd4bf", "#fb923c"],
  },
} as const;

export type ChartPalette = (typeof CHART_THEME)[keyof typeof CHART_THEME];

// intraday 잠금 뷰: 전일 마지막 세션 봉을 좌측에 흐리게 걸치는 여유. 3600s = 6개 10분봉.
export const INTRADAY_PREV_LOOKBACK_SEC = 3600;
