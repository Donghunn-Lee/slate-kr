type TypeRowProps = {
  label: string;
  spec: string;
  children: React.ReactNode;
  style: React.CSSProperties;
};

const TypeRow = ({ label, spec, children, style }: TypeRowProps) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "160px 1fr",
      gap: "24px",
      alignItems: "baseline",
      padding: "20px 0",
      borderBottom: "1px solid var(--border-subtle)",
    }}
  >
    <div>
      <p
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--text-primary)",
          fontFamily: "monospace",
          marginBottom: "2px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
        {spec}
      </p>
    </div>
    <div style={style}>{children}</div>
  </div>
);

export const Typography = () => (
  <section>
    <h2
      style={{
        fontSize: "18px",
        fontWeight: 600,
        color: "var(--text-primary)",
        marginBottom: "24px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      Typography
    </h2>

    <div>
      <TypeRow
        label="display"
        spec="36px / 700 / -0.02em"
        style={{
          fontSize: "36px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        219,500원
      </TypeRow>

      <TypeRow
        label="headline"
        spec="20px / 600 / -0.01em"
        style={{
          fontSize: "20px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
          lineHeight: 1.3,
        }}
      >
        핵심 지표 (2025년 연간 기준)
      </TypeRow>

      <TypeRow
        label="body"
        spec="14px / 400 / 0"
        style={{
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--text-primary)",
          lineHeight: 1.6,
        }}
      >
        주가·재무·공시 정보를 빠르게 조회할 수 있습니다.
      </TypeRow>

      <TypeRow
        label="caption"
        spec="12px / 500 / 0.01em"
        style={{
          fontSize: "12px",
          fontWeight: 500,
          letterSpacing: "0.01em",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        기준일 2026-04-24
      </TypeRow>

      <TypeRow
        label="mono (tabular-nums)"
        spec="14px / 400 / tabular-nums"
        style={{
          fontSize: "14px",
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
          lineHeight: 1.6,
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", gap: "32px" }}>
          <span>1,222,000</span>
          <span>219,500</span>
          <span>513,000</span>
        </div>
        <p
          style={{
            fontSize: "11px",
            color: "var(--text-tertiary)",
            marginTop: "6px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          자릿수 정렬 확인 — 각 숫자의 첫째 자리가 세로로 맞아야 함
        </p>
      </TypeRow>
    </div>
  </section>
);
