"use client";

import { useState, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────
   공통: 섹션 래퍼
────────────────────────────────────────────── */
type DemoBlockProps = {
  title: string;
  description: string;
  token: string;
  children: React.ReactNode;
};

const DemoBlock = ({ title, description, token, children }: DemoBlockProps) => (
  <div
    style={{
      padding: "24px",
      backgroundColor: "var(--bg-elevated)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg, 0.625rem)",
    }}
  >
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          {title}
        </p>
        <code
          style={{
            fontSize: "10px",
            fontFamily: "monospace",
            color: "var(--text-tertiary)",
            backgroundColor: "var(--border-subtle)",
            padding: "1px 6px",
            borderRadius: "4px",
          }}
        >
          {token}
        </code>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{description}</p>
    </div>
    {children}
  </div>
);

/* ──────────────────────────────────────────────
   데모 1: Panel Hover
────────────────────────────────────────────── */
const PanelHoverDemo = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <DemoBlock
      title="Panel Hover"
      description="duration-fast (150ms) + ease-smooth — 가벼운 떠오름"
      token="--duration-fast"
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: `1px solid ${hovered ? "var(--border-default)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-lg, 0.625rem)",
          boxShadow: hovered ? "var(--shadow-slate-hover)" : "var(--shadow-slate)",
          padding: "20px 24px",
          transform: hovered ? "translateY(-3px)" : "translateY(0)",
          transition:
            "transform var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), box-shadow var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), border-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
          cursor: "default",
          maxWidth: "400px",
        }}
      >
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-tertiary)",
            marginBottom: "8px",
            fontStyle: "italic",
          }}
        >
          마우스를 올려보세요
        </p>
        <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
          삼성전자 — 005930 · KOSPI
        </p>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            marginTop: "4px",
          }}
        >
          시가총액 1,299.36조원
        </p>
      </div>
    </DemoBlock>
  );
};

/* ──────────────────────────────────────────────
   데모 2: Panel Expand
────────────────────────────────────────────── */
const QUARTERLY_DATA = [
  { period: "2025Q4", revenue: "890,219억원", op: "124,003억원" },
  { period: "2025Q3", revenue: "813,450억원", op: "108,720억원" },
  { period: "2025Q2", revenue: "748,336억원", op: "97,412억원" },
  { period: "2025Q1", revenue: "684,054억원", op: "82,310억원" },
];

const PanelExpandDemo = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <DemoBlock
      title="Panel Expand"
      description="duration-base (250ms) — 패널 내부 정보 펼침"
      token="--duration-base"
    >
      <div
        style={{
          backgroundColor: "var(--sage-bg)",
          border: "1px solid var(--sage-border)",
          borderRadius: "var(--radius-lg, 0.625rem)",
          boxShadow: "var(--shadow-slate)",
          overflow: "hidden",
          maxWidth: "480px",
        }}
      >
        {/* 헤더 */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "none",
            border: "none",
            cursor: "pointer",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "var(--sage-accent)",
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}
            >
              재무 요약 (연간)
            </span>
          </div>
          {/* Chevron */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              flexShrink: 0,
              color: "var(--text-secondary)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: `transform var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))`,
            }}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* 기본 행 */}
        <div
          style={{
            padding: "0 20px 16px",
            borderTop: "1px solid var(--sage-border)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 1fr",
              gap: "8px",
              padding: "10px 0",
              fontSize: "12px",
            }}
          >
            <span
              style={{ fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
            >
              2025년
            </span>
            <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              3,336,059억원
            </span>
            <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              436,011억원
            </span>
          </div>

          {/* 펼쳐지는 분기 데이터 */}
          <div
            style={{
              maxHeight: expanded ? "500px" : "0",
              opacity: expanded ? 1 : 0,
              overflow: "hidden",
              transition: `max-height var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))`,
            }}
          >
            <div style={{ borderTop: "1px solid var(--sage-border)", paddingTop: "4px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 1fr",
                  gap: "8px",
                  padding: "4px 0 8px",
                  fontSize: "10px",
                  color: "var(--text-tertiary)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span>분기</span>
                <span>매출</span>
                <span>영업이익</span>
              </div>
              {QUARTERLY_DATA.map(({ period, revenue, op }) => (
                <div
                  key={period}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 1fr",
                    gap: "8px",
                    padding: "8px 0",
                    fontSize: "12px",
                    borderTop: "1px solid var(--sage-border)",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {period}
                  </span>
                  <span
                    style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {revenue}
                  </span>
                  <span
                    style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {op}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DemoBlock>
  );
};

/* ──────────────────────────────────────────────
   데모 3: 공시 행 인터랙션
────────────────────────────────────────────── */
type DisclosureRowDemoProps = {
  badge: string;
  badgeBg: string;
  badgeColor: string;
  title: string;
  date: string;
  filer: string;
};

const DisclosureRowItem = ({
  badge,
  badgeBg,
  badgeColor,
  title,
  date,
  filer,
}: DisclosureRowDemoProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 16px",
        borderBottom: "1px solid var(--amber-border)",
        backgroundColor: hovered ? "var(--amber-border)" : "transparent",
        transition: `background-color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))`,
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: badgeColor,
            backgroundColor: badgeBg,
            padding: "2px 7px",
            borderRadius: "4px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {date}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {filer}
        </span>
        {/* AI 요약 버튼 — 슬라이드 인 */}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--amber-accent)",
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--amber-border)",
            padding: "2px 8px",
            borderRadius: "4px",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "translateX(0)" : "translateX(8px)",
            transition: `opacity var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), transform var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))`,
            pointerEvents: hovered ? "auto" : "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          AI 요약
        </span>
      </div>
    </li>
  );
};

const DisclosureRowDemo = () => (
  <DemoBlock
    title="공시 행 인터랙션"
    description="행 hover 시 보조 액션이 슬라이드 인 — 시야 분산 최소화"
    token="--duration-fast"
  >
    <div
      style={{
        backgroundColor: "var(--amber-bg)",
        border: "1px solid var(--amber-border)",
        borderRadius: "var(--radius-lg, 0.625rem)",
        boxShadow: "var(--shadow-slate)",
        overflow: "hidden",
        maxWidth: "600px",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--amber-border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "var(--amber-accent)",
          }}
        />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
          최근 공시
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
          행에 마우스를 올려보세요
        </span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        <DisclosureRowItem
          badge="소유상황"
          badgeBg="var(--lavender-bg)"
          badgeColor="var(--lavender-accent)"
          title="주식등의대량보유상황보고서(일반)"
          date="2026.05.04"
          filer="삼성물산"
        />
        <DisclosureRowItem
          badge="정기보고서"
          badgeBg="var(--sky-bg)"
          badgeColor="var(--sky-accent)"
          title="사업보고서 (2025.12)"
          date="2026.03.31"
          filer="삼성전자"
        />
        <DisclosureRowItem
          badge="주요사항"
          badgeBg="var(--sage-bg)"
          badgeColor="var(--sage-accent)"
          title="주요사항보고서(유상증자결정)"
          date="2026.02.14"
          filer="삼성전자"
        />
      </ul>
    </div>
  </DemoBlock>
);

/* ──────────────────────────────────────────────
   데모 4: 숫자 카운트업
────────────────────────────────────────────── */
const PRICE_SEQUENCE = [
  { value: 219500, delta: -5000, pct: "-2.23%", dir: "down" as const },
  { value: 224800, delta: +5300, pct: "+2.41%", dir: "up" as const },
  { value: 218100, delta: -6700, pct: "-2.98%", dir: "down" as const },
];

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

const formatPrice = (n: number) =>
  Math.round(n).toLocaleString("ko-KR") + "원";

const CountUpDemo = () => {
  const [index, setIndex] = useState(0);
  const [displayValue, setDisplayValue] = useState(PRICE_SEQUENCE[0].value);
  const frameRef = useRef<number>(0);

  const current = PRICE_SEQUENCE[index];

  const handleNext = () => {
    const nextIndex = (index + 1) % PRICE_SEQUENCE.length;
    const start = PRICE_SEQUENCE[index].value;
    const end = PRICE_SEQUENCE[nextIndex].value;
    const duration = 600;
    const startTime = performance.now();

    cancelAnimationFrame(frameRef.current);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setDisplayValue(start + (end - start) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    setIndex(nextIndex);
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return (
    <DemoBlock
      title="숫자 카운트업"
      description="재방문 시점 가격 변화 인지를 위한 부드러운 보간 — easeOutCubic 600ms"
      token="requestAnimationFrame"
    >
      <div
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg, 0.625rem)",
          boxShadow: "var(--shadow-slate)",
          padding: "20px 24px",
          maxWidth: "360px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            marginBottom: "8px",
          }}
        >
          현재 가격
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
          <span
            style={{
              fontSize: "36px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatPrice(displayValue)}
          </span>
        </div>
        <p
          style={{
            fontSize: "14px",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color:
              current.dir === "up" ? "var(--price-up)" : "var(--price-down)",
            marginBottom: "16px",
            transition: `color var(--duration-fast, 150ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))`,
          }}
        >
          {current.dir === "up" ? "+" : ""}
          {current.delta.toLocaleString("ko-KR")}원 ({current.pct})
        </p>
        <button
          onClick={handleNext}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--text-secondary)",
            backgroundColor: "var(--border-subtle)",
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          가격 갱신
        </button>
      </div>
    </DemoBlock>
  );
};

/* ──────────────────────────────────────────────
   메인 export
────────────────────────────────────────────── */
export const InteractionDemo = () => (
  <section>
    <h2
      style={{
        fontSize: "18px",
        fontWeight: 600,
        color: "var(--text-primary)",
        marginBottom: "8px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      Interaction Patterns
    </h2>
    <p
      style={{
        fontSize: "13px",
        color: "var(--text-secondary)",
        marginBottom: "24px",
      }}
    >
      motion 토큰 실제 타이밍·강도 시각화 — 페이지 적용 전 레퍼런스
    </p>

    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PanelHoverDemo />
      <PanelExpandDemo />
      <DisclosureRowDemo />
      <CountUpDemo />
    </div>
  </section>
);
