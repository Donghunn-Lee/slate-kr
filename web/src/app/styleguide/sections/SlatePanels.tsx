type PanelVariant = {
  name: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
};

const VARIANTS: PanelVariant[] = [
  {
    name: "Plain",
    bg: "var(--bg-elevated)",
    border: "var(--border-subtle)",
    dot: "var(--text-tertiary)",
    label: "기본 패널 — bg-elevated + border-subtle",
  },
  {
    name: "Sky",
    bg: "var(--sky-bg)",
    border: "var(--sky-border)",
    dot: "var(--sky-accent)",
    label: "하늘색 강조 — 차트·가격 섹션",
  },
  {
    name: "Sage",
    bg: "var(--sage-bg)",
    border: "var(--sage-border)",
    dot: "var(--sage-accent)",
    label: "민트/세이지 — 재무·안전성 섹션",
  },
  {
    name: "Amber",
    bg: "var(--amber-bg)",
    border: "var(--amber-border)",
    dot: "var(--amber-accent)",
    label: "앰버 — 공시·주의 섹션",
  },
  {
    name: "Lavender",
    bg: "var(--lavender-bg)",
    border: "var(--lavender-border)",
    dot: "var(--lavender-accent)",
    label: "라벤더 — AI 요약·분석 섹션",
  },
  {
    name: "Peach",
    bg: "var(--peach-bg)",
    border: "var(--peach-border)",
    dot: "var(--peach-accent)",
    label: "피치 — 알림·이벤트 섹션",
  },
];

export const SlatePanels = () => (
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
      Slate Panels
    </h2>
    <p
      style={{
        fontSize: "13px",
        color: "var(--text-secondary)",
        marginBottom: "24px",
      }}
    >
      6종 패널 변형 — 동일 구조에서 배경·테두리 색만 교체
    </p>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "16px",
      }}
    >
      {VARIANTS.map(({ name, bg, border, dot, label }) => (
        <div
          key={name}
          style={{
            backgroundColor: bg,
            border: `1px solid ${border}`,
            borderRadius: "var(--radius-lg, 0.625rem)",
            boxShadow: "var(--shadow-slate)",
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: dot,
                flexShrink: 0,
              }}
            />
            <p
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              패널 제목 — {name}
            </p>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {label}
          </p>
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              gap: "6px",
            }}
          >
            <code
              style={{
                fontSize: "10px",
                fontFamily: "monospace",
                color: "var(--text-tertiary)",
                backgroundColor: border,
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              bg: --{name.toLowerCase()}-bg
            </code>
            <code
              style={{
                fontSize: "10px",
                fontFamily: "monospace",
                color: "var(--text-tertiary)",
                backgroundColor: border,
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              border: --{name.toLowerCase()}-border
            </code>
          </div>
        </div>
      ))}
    </div>
  </section>
);
