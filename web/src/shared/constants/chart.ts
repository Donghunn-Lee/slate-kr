import type { Time } from "lightweight-charts";

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

// 지수 END 라벨 세션 경계 (HHMMSS ASC). 정규장 마감 15:30 단일 경계.
// 종목(StockChartTabs) 은 프리·정규·애프터 3경계라 별도.
export const INDEX_END_LABEL_BOUNDARIES: readonly string[] = ["153000"];

// 홈·Rail mini 차트가 소비하는 인터벌(분). 값 1개 상수로 유지 — 미니 렌더 결정.
export const INDEX_MINI_INTERVAL_MIN = 1;

// 크로스헤어 시간 라벨 포맷터. intraday(timeVisible)= `MM-DD HH:mm` / EOD= `YYYY-MM-DD`.
// timestamp 는 국내 KST · 해외 ET 벽시계를 UTC 로 위장한 epoch 초 → getUTC* 로 원본
// 컴포넌트 복원 (로컬 TZ 변환 금지). 하단 tickMarkFormatter 는 별도 관리.
const pad2 = (n: number): string => String(n).padStart(2, "0");

const formatCrosshairTime = (time: Time, timeVisible: boolean): string => {
  let y: number, m: number, d: number, hh = 0, mm = 0;
  if (typeof time === "number") {
    const dt = new Date(time * 1000);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
    hh = dt.getUTCHours();
    mm = dt.getUTCMinutes();
  } else if (typeof time === "string") {
    const [ys, ms, ds] = time.split("-").map(Number);
    y = ys;
    m = ms;
    d = ds;
  } else {
    y = time.year;
    m = time.month;
    d = time.day;
  }
  return timeVisible
    ? `${pad2(m)}-${pad2(d)} ${pad2(hh)}:${pad2(mm)}`
    : `${y}-${pad2(m)}-${pad2(d)}`;
};

export const crosshairLocalization = (timeVisible: boolean) => ({
  locale: "ko-KR",
  timeFormatter: (time: Time): string => formatCrosshairTime(time, timeVisible),
});
