type TypeRowProps = {
  label: string;
  spec: string;
  children: React.ReactNode;
  style: React.CSSProperties;
};

const TypeRow = ({ label, spec, children, style }: TypeRowProps) => (
  <div className="grid grid-cols-[160px_1fr] items-baseline gap-6 border-b border-subtle py-5">
    <div>
      <p className="mb-0.5 font-mono text-[11px] font-semibold text-foreground">{label}</p>
      <p className="font-mono text-[10px] text-muted-foreground">{spec}</p>
    </div>
    <div style={style}>{children}</div>
  </div>
);

export const Typography = () => (
  <section>
    <h2 className="mb-6 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
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
          color: "var(--foreground)",
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
          color: "var(--foreground)",
          lineHeight: 1.3,
        }}
      >
        핵심 지표 (2025년 연간 기준)
      </TypeRow>

      <TypeRow
        label="body"
        spec="14px / 400 / 0"
        style={{ fontSize: "14px", fontWeight: 400, color: "var(--foreground)", lineHeight: 1.6 }}
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
          color: "var(--muted-foreground)",
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
          color: "var(--foreground)",
          lineHeight: 1.6,
          fontFamily: "inherit",
        }}
      >
        <div className="flex gap-8">
          <span>1,222,000</span>
          <span>219,500</span>
          <span>513,000</span>
        </div>
        <p className="mt-1.5 tabular-nums text-[11px] text-muted-foreground">
          자릿수 정렬 확인 — 각 숫자의 첫째 자리가 세로로 맞아야 함
        </p>
      </TypeRow>
    </div>
  </section>
);
