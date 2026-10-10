"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";

// play=true 로 마운트되면 애니메이션 실행. play=false 면 최종 상태 정지 렌더.
// 재재생은 부모가 key 를 바꿔 재마운트시키는 방식으로 트리거.
// 하이드레이션은 reduced-motion 을 서버 스냅샷(false)으로 읽어 애니메이션 대기 상태로 마운트한 뒤
// 곧바로 reduce 로 바뀔 수 있다. 그때 진입 effect 가 건너뛰어지므로 표시는 shouldAnimate 가 꺼지면 항상 최종 상태다.
type PreviewProps = { play: boolean };

// AI 요약은 맨 앞에 둔다. lg 미만은 칩을 2줄까지만 보여서 뒤에 두면 셋째 줄로 밀려 가려진다.
const DISCLOSURE_CHIPS = [
  { label: "AI 요약", cls: "bg-sky-bg text-sky-text border border-sky-border" },
  { label: "주요사항", cls: "bg-disclosure-major-event-bg text-disclosure-major-event-text" },
  { label: "정기보고서", cls: "bg-disclosure-financial-bg text-disclosure-financial-text" },
  { label: "소유상황", cls: "bg-disclosure-ownership-bg text-disclosure-ownership-text" },
  { label: "감사", cls: "bg-disclosure-audit-bg text-disclosure-audit-text" },
  { label: "주주총회", cls: "bg-disclosure-shareholder-meeting-bg text-amber-text" },
  { label: "시장조치", cls: "bg-disclosure-market-action-bg text-disclosure-market-action-text" },
];

export const DisclosurePreview = ({ play }: PreviewProps) => {
  const prefersReduced = usePrefersReducedMotion();
  const shouldAnimate = play && !prefersReduced;
  const [entered, setEntered] = useState(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [shouldAnimate]);

  // lg 미만은 칩을 2줄까지만 보인다. md 는 히어로가 2열이라 카드가 좁아 3줄이 되고,
  // 글꼴에 따라 2 ↔ 3줄로 바뀌면 카드 높이가 달라져 아래 섹션이 밀린다.
  // 최대 높이 = 칩 2줄((글자 1.35배 + 세로 패딩 4px) × 2) + 줄 간격 6px + 첫 줄 AI 요약 칩 테두리 2px.
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-lg:max-h-[calc(var(--fs-micro)*2.7+16px)] max-lg:overflow-hidden">
      {DISCLOSURE_CHIPS.map((chip, i) => (
        <span
          key={chip.label}
          className={cn(
            "inline-flex items-center rounded-sm px-1.5 py-0.5 text-micro font-medium",
            chip.cls,
            shouldAnimate && "transition-all duration-500 ease-out",
            entered || !shouldAnimate ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          style={shouldAnimate ? { transitionDelay: `${i * 150}ms` } : undefined}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
};

// 대시선(y=46) 아래 횡보 → 급등 돌파 → 깊은 되돌림(재테스트) → 다시 상승 후 지그재그로 신고가.
// 구간별로 슬로프와 진폭을 달리해 실제 시장 차트 느낌. pathLength=1 정규화 후 dashoffset draw.
const SPARKLINE_PATH = [
  "M 4 51",
  "L 10 53", "L 16 50", "L 22 54", "L 28 51", "L 34 55", "L 40 52",
  "L 46 47", "L 52 40", "L 58 35", "L 64 38", "L 70 32",
  "L 76 40", "L 82 46", "L 88 52", "L 94 56", "L 100 53", "L 106 55",
  "L 112 48", "L 118 42", "L 124 38", "L 130 33", "L 136 36", "L 142 28",
  "L 148 30", "L 154 22", "L 160 26", "L 166 18", "L 172 22",
  "L 178 12", "L 184 15", "L 192 8", "L 200 4",
].join(" ");

const SPARKLINE_VIEW_W = 200;
const SPARKLINE_VIEW_H = 60;
const SPARKLINE_END_X = 200;
const SPARKLINE_END_Y = 4;

export const PricePreview = ({ play }: PreviewProps) => {
  const prefersReduced = usePrefersReducedMotion();
  const shouldAnimate = play && !prefersReduced;
  const [entered, setEntered] = useState(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [shouldAnimate]);

  // 마커는 SVG 안 <circle> 대신 SVG 밖 CSS 원으로 배치. preserveAspectRatio="none" 상황에서
  // <circle> 은 x/y 배율 차이로 타원이 되지만, HTML 요소는 좌표계에 무관해 언제나 정원.
  const markerLeftPct = (SPARKLINE_END_X / SPARKLINE_VIEW_W) * 100;
  const markerTopPct = (SPARKLINE_END_Y / SPARKLINE_VIEW_H) * 100;

  return (
    <div className="relative h-14 w-full text-lavender-accent sm:h-16">
      <svg
        viewBox={`0 0 ${SPARKLINE_VIEW_W} ${SPARKLINE_VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <line
          x1="0"
          y1="46"
          x2="200"
          y2="46"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
        {/*
          non-scaling-stroke 는 Blink 에서 dasharray 를 화면 픽셀 기준으로 재해석 →
          카드 폭 커지면 실제 path 픽셀 length 를 커버 못해 뒷부분 잘림.
          non-scaling-stroke 제거 + pathLength=1 정규화로 폭 무관 완전 draw 보장.
        */}
        <path
          d={SPARKLINE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: entered || !shouldAnimate ? 0 : 1,
            transition: shouldAnimate ? "stroke-dashoffset 1s ease-out" : "none",
          }}
        />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-lavender-bg"
        style={{
          left: `${markerLeftPct}%`,
          top: `${markerTopPct}%`,
          opacity: entered || !shouldAnimate ? 1 : 0,
          transition: shouldAnimate ? "opacity 250ms ease-out 900ms" : "none",
        }}
      />
    </div>
  );
};

type Metric = {
  label: string;
  target: number;
  format: (v: number) => string;
};

const METRICS: Metric[] = [
  { label: "PER", target: 12.3, format: (v) => v.toFixed(1) },
  { label: "PBR", target: 1.24, format: (v) => v.toFixed(2) },
  { label: "EPS", target: 5384, format: (v) => Math.round(v).toLocaleString() },
  { label: "BPS", target: 45821, format: (v) => Math.round(v).toLocaleString() },
];

const COUNTUP_DURATION_MS = 900;

const useCountUp = (target: number, shouldAnimate: boolean) => {
  const [value, setValue] = useState(shouldAnimate ? 0 : target);

  useEffect(() => {
    if (!shouldAnimate) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / COUNTUP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, shouldAnimate]);

  return shouldAnimate ? value : target;
};

const MetricValue = ({
  metric,
  shouldAnimate,
}: {
  metric: Metric;
  shouldAnimate: boolean;
}) => {
  const value = useCountUp(metric.target, shouldAnimate);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-micro text-muted-foreground/80">{metric.label}</span>
      <span className="tabular-nums text-body font-semibold text-foreground">
        {metric.format(value)}
      </span>
    </div>
  );
};

export const MetricsPreview = ({ play }: PreviewProps) => {
  const prefersReduced = usePrefersReducedMotion();
  const shouldAnimate = play && !prefersReduced;

  // 라벨·값을 한 줄로 붙인 2×2. 라벨 위 값 1×4 는 차트 프리뷰보다 10px 남짓 낮아, 카드 높이를 맞추면 설명과 지표 사이가 그만큼 비어 보인다.
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
      {METRICS.map((metric) => (
        <MetricValue key={metric.label} metric={metric} shouldAnimate={shouldAnimate} />
      ))}
    </div>
  );
};

type RankingRow = {
  name: string;
  change: string;
  tone: "up" | "down";
};

// 등락은 표본 값이다. 익숙한 종목명을 쓰되 실제 시세로 읽히지 않게 날짜·가격은 두지 않는다.
const RANKING_ROWS: RankingRow[] = [
  { name: "삼성전자", change: "+4.12%", tone: "up" },
  { name: "SK하이닉스", change: "+2.35%", tone: "up" },
  { name: "현대차", change: "-1.08%", tone: "down" },
];

// 정적 표본. 실제 시세가 아닌 순위·등락은 읽어 줄 정보가 아니라 차트처럼 통째로 숨긴다.
// 배지는 leading-none 으로 행 높이를 caption 줄 높이에 맞춘다 — 3행이 가격 차트(h-14·sm:h-16)를 넘지 않게.
export const RankingPreview = () => (
  <div className="flex w-full flex-col gap-1 text-caption" aria-hidden>
    {RANKING_ROWS.map((row, i) => (
      <div key={row.name} className="flex items-center gap-2">
        <span className="w-3 text-center font-mono tabular-nums text-muted-foreground">
          {i + 1}
        </span>
        <span className="min-w-0 truncate text-foreground">{row.name}</span>
        <span
          className={cn(
            "ml-auto rounded-sm px-1.5 py-0.5 text-micro font-medium leading-none tabular-nums",
            row.tone === "up" ? "bg-price-up/10 text-price-up" : "bg-price-down/10 text-price-down",
          )}
        >
          {row.change}
        </span>
      </div>
    ))}
  </div>
);
