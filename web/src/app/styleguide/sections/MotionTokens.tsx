type MotionTokenCardProps = {
  token: string;
  value: string;
  label: string;
  swatch?: React.ReactNode;
};

const MotionTokenCard = ({ token, value, label, swatch }: MotionTokenCardProps) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px",
      borderRadius: "6px",
      backgroundColor: "var(--bg-elevated)",
      border: "1px solid var(--border-subtle)",
    }}
  >
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "6px",
        backgroundColor: "var(--border-subtle)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "9px",
        fontFamily: "monospace",
        color: "var(--text-tertiary)",
      }}
    >
      {swatch ?? value}
    </div>
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--text-primary)",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {token}
      </p>
      <p
        style={{
          fontSize: "10px",
          color: "var(--text-tertiary)",
          fontFamily: "monospace",
          marginTop: "1px",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "1px" }}>
        {label}
      </p>
    </div>
  </div>
);

// cubic-bezier(0.4, 0, 0.2, 1) — M 0 40 C 16 40, 8 0, 40 0
const EaseCurveSwatch = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 40 40"
    fill="none"
    style={{ display: "block" }}
  >
    <path
      d="M 0 40 C 16 40, 8 0, 40 0"
      stroke="var(--text-secondary)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MOTION_TOKENS: MotionTokenCardProps[] = [
  { token: "--duration-fast", value: "150ms", label: "패널 hover, 행 인터랙션" },
  { token: "--duration-base", value: "250ms", label: "패널 expand, 전환 애니메이션" },
  { token: "--duration-slow", value: "400ms", label: "페이지 레벨 전환" },
  {
    token: "--ease-smooth",
    value: "cubic-bezier(0.4, 0, 0.2, 1)",
    label: "기본 이징 곡선",
    swatch: <EaseCurveSwatch />,
  },
];

export const MotionTokens = () => (
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
      Motion Tokens
    </h2>
    <p
      style={{
        fontSize: "13px",
        color: "var(--text-secondary)",
        marginBottom: "24px",
      }}
    >
      duration · easing 토큰 정의 — 인터랙션 구현 시 참조
    </p>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "10px",
      }}
    >
      {MOTION_TOKENS.map((t) => (
        <MotionTokenCard key={t.token} {...t} />
      ))}
    </div>
  </section>
);
