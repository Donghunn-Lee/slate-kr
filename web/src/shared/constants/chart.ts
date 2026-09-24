import type { Time } from "lightweight-charts";

// KR 관행: 상승=레드, 하락=블루. up/down 은 globals.css --price-up/--price-down 과 동일값 —
// 브라우저 computed sRGB 를 hex 로 옮긴 값이다(oklch 수동 환산 아님).
//   light: up oklch(0.52 0.2 25)=#c21725 · down oklch(0.48 0.18 260)=#1156c0
//   dark : up oklch(0.62 0.19 25)=#e24947 · down oklch(0.62 0.16 260)=#4983e5
// bg/text/border 도 같은 방식으로 --bg-elevated(차트가 놓이는 패널 배경)·--text-primary·--border-subtle 을 옮긴 값.
//   light: bg oklch(0.995 0.003 85)=#fefdfb · text oklch(0.25 0.02 270)=#1e212b · border oklch(0.92 0.005 85)=#e6e4e1
//   dark : bg oklch(0.21 0.004 85)=#191816 · text oklch(0.95 0.008 270)=#eceef4 · border oklch(0.26 0.005 85)=#252421
// 토큰 값을 바꾸면 여기 hex 와 아래 rgba 파생값을 함께 갱신한다.
// dim.{up,down} — 전일 봉 등 흐림 처리용 저채도 저대비 버전. 무채색 계열과 톤 충돌 없도록
// 원색의 알파를 낮춰 배경에 자연스레 녹아들게 한다.
// volume.{up,down} — 하단 histogram 오버레이용. 반투명이 관례이므로 원색 alpha 를 더 낮춘다.
// baseline.{top,bottom}Fill{1,2} — intraday 선차트(BaselineSeries) 영역 그라데이션.
// fill1(진함) → fill2(옅음) 로 baseline 에 가까워질수록 소멸. 렌더 확인 후 알파 미세조정 여지.
// {top,bottom}FillClear — IndexMiniChart baseline 끝단(완전 투명). 미니 셀 높이에선 fill2 잔색도
// 면으로 읽혀 0 까지 뺀다.
// neutralLine / neutralTopFill / neutralBottomFill — baseline 개념 부재 뷰(EOD·주·월 선차트) 용
// AreaSeries 무채색. IndexMiniChart 의 prevClose 부재 fallback 도 같은 키를 쓴다. 알파 0.18 → 0.02 그라데이션.
// prevCloseLine — IndexMiniChart 전일종가 dashed 기준선. 무채 반투명.
// ma[] — 이동평균선 팔레트. period index 로 매핑, 초과 시 modulo 순환. 캔들 red/blue 와
// 톤 충돌 없이 서로 구분되도록 노랑·보라·청록·주황 계열 (KR 일봉 차트 관행에 근접).
export const CHART_THEME = {
  light: {
    bg: "#fefdfb",
    text: "#1e212b",
    border: "#e6e4e1",
    up: "#c21725",
    down: "#1156c0",
    dim: {
      up: "rgba(194,23,37,0.28)",
      down: "rgba(17,86,192,0.28)",
    },
    volume: {
      up: "rgba(194,23,37,0.35)",
      down: "rgba(17,86,192,0.35)",
    },
    baseline: {
      topFill1: "rgba(194,23,37,0.28)",
      topFill2: "rgba(194,23,37,0.05)",
      bottomFill1: "rgba(17,86,192,0.28)",
      bottomFill2: "rgba(17,86,192,0.05)",
      topFillClear: "rgba(194,23,37,0)",
      bottomFillClear: "rgba(17,86,192,0)",
    },
    neutralLine: "#525252",
    neutralTopFill: "rgba(82,82,82,0.18)",
    neutralBottomFill: "rgba(82,82,82,0.02)",
    prevCloseLine: "rgba(0,0,0,0.28)",
    ma: ["#eab308", "#a855f7", "#14b8a6", "#f97316"],
  },
  dark: {
    bg: "#191816",
    text: "#eceef4",
    border: "#252421",
    up: "#e24947",
    down: "#4983e5",
    dim: {
      up: "rgba(226,73,71,0.35)",
      down: "rgba(73,131,229,0.35)",
    },
    volume: {
      up: "rgba(226,73,71,0.45)",
      down: "rgba(73,131,229,0.45)",
    },
    baseline: {
      topFill1: "rgba(226,73,71,0.28)",
      topFill2: "rgba(226,73,71,0.05)",
      bottomFill1: "rgba(73,131,229,0.28)",
      bottomFill2: "rgba(73,131,229,0.05)",
      topFillClear: "rgba(226,73,71,0)",
      bottomFillClear: "rgba(73,131,229,0)",
    },
    neutralLine: "#a3a3a3",
    neutralTopFill: "rgba(163,163,163,0.18)",
    neutralBottomFill: "rgba(163,163,163,0.02)",
    prevCloseLine: "rgba(255,255,255,0.28)",
    ma: ["#facc15", "#c084fc", "#2dd4bf", "#fb923c"],
  },
} as const;

export type ChartPalette = (typeof CHART_THEME)[keyof typeof CHART_THEME];

// intraday 잠금 뷰 초기 창의 좌측 끝 = 전일 마지막 봉에서 이만큼 되짚은 봉.
// 시간 폭이 아닌 봉 수인 이유: 시간 폭으로 자르면 간격마다 담기는 봉 수가 달라져
// 15분 뷰는 전일 2봉만 남고 그 2봉이 화면을 뒤덮는다. 봉 수로 잡으면 1/5/15분 어디서나
// 전일 tail 이 같은 화면 비중을 차지한다.
export const INTRADAY_PREV_LOOKBACK_BARS = 30;

// intraday 잠금 뷰 초기 창의 우측 여백 = 마지막 봉 뒤에 남길 빈 슬롯 수.
// 초 폭이 아닌 봉 수인 이유: 창을 logical range 로 잡으므로 오늘 봉이 0개인 개장 전에도
// 우측이 비고, 여백이 봉 폭에 비례해 어느 간격에서나 같은 개수로 보인다.
export const INTRADAY_RIGHT_MARGIN_BARS = 10;

// 지수 END 라벨 세션 경계 (HHMMSS ASC). 국내 정규장 마감 15:30 단일.
// 종목(StockChartTabs) 은 프리·정규·애프터 3경계라 별도.
// 해외 지수는 KIS HTS 관례상 START 라벨 유지 → 이 경계를 소비하지 않는다.
export const INDEX_END_LABEL_BOUNDARIES: readonly string[] = ["153000"];

// 홈 IndexSlate mini 차트가 소비하는 인터벌(분). 값 1개 상수로 유지 — 미니 렌더 결정.
export const INDEX_MINI_INTERVAL_MIN = 1;

// 미니 차트 timeScale.minBarSpacing. fitContent 는 봉 폭을 이 하한으로 클램프한
// 뒤 우측 끝을 고정하므로, 한 세션(1분 × 390봉)이 플롯 폭 ÷ 하한 을 넘으면 좌측 봉이
// 잘린다. 기본 0.5 는 반폭 셀 플롯(~130~160px)에서 300봉 남짓만 담는다. 0.2 는 플롯
// 80px 까지 전 세션을 담는 값.
export const INDEX_MINI_MIN_BAR_SPACING = 0.2;

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
