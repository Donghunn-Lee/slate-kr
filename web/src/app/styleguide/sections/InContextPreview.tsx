/* ── 1. 종목 헤더 패널 ── */
const StockHeaderPanel = () => (
  <div
    style={{
      backgroundColor: "var(--bg-elevated)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg, 0.625rem)",
      boxShadow: "var(--shadow-slate)",
      padding: "24px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
      <span
        style={{
          fontSize: "20px",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
        }}
      >
        삼성전자
      </span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--text-secondary)",
          backgroundColor: "var(--border-subtle)",
          padding: "2px 7px",
          borderRadius: "4px",
          fontFamily: "monospace",
        }}
      >
        005930
      </span>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--sky-accent)",
          backgroundColor: "var(--sky-bg)",
          border: "1px solid var(--sky-border)",
          padding: "2px 7px",
          borderRadius: "4px",
        }}
      >
        KOSPI
      </span>
    </div>

    <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "10px" }}>
      <span
        style={{
          fontSize: "36px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        219,500원
      </span>
      <span
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--price-down)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        -5,000원 (-2.23%)
      </span>
    </div>

    <div
      style={{
        display: "flex",
        gap: "20px",
        fontSize: "12px",
        fontWeight: 500,
        color: "var(--text-secondary)",
        letterSpacing: "0.01em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span>거래량 19,165,257주</span>
      <span>시가총액 1,299.36조원</span>
      <span>기준일 2026-04-24</span>
    </div>
  </div>
);

/* ── 2. 핵심 지표 패널 ── */
const MetricsPanel = () => (
  <div
    style={{
      backgroundColor: "var(--peach-bg)",
      border: "1px solid var(--peach-border)",
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
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: "var(--peach-accent)",
        }}
      />
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        핵심 지표{" "}
        <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-secondary)" }}>
          (2025년 연간 기준)
        </span>
      </h3>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
      }}
    >
      {[
        { label: "PER", value: "33.23배" },
        { label: "PBR", value: "—" },
        { label: "EPS", value: "6,605원" },
        { label: "BPS", value: "—" },
      ].map(({ label, value }) => (
        <div key={label}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--text-tertiary)",
              letterSpacing: "0.03em",
              marginBottom: "4px",
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  </div>
);

/* ── 3. 공시 행 패널 ── */
type DisclosureRowProps = {
  badge: string;
  badgeBg: string;
  badgeColor: string;
  title: string;
  date: string;
  filer: string;
};

const DisclosureRow = ({ badge, badgeBg, badgeColor, title, date, filer }: DisclosureRowProps) => (
  <li
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "12px 0",
      borderBottom: "1px solid var(--sky-border)",
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
        gap: "12px",
        flexShrink: 0,
        fontSize: "12px",
        color: "var(--text-secondary)",
      }}
    >
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{date}</span>
      <span>{filer}</span>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--sky-accent)",
          backgroundColor: "var(--sky-bg)",
          border: "1px solid var(--sky-border)",
          padding: "2px 8px",
          borderRadius: "4px",
          cursor: "default",
        }}
      >
        AI 요약
      </span>
    </div>
  </li>
);

const DisclosuresPanel = () => (
  <div
    style={{
      backgroundColor: "var(--sky-bg)",
      border: "1px solid var(--sky-border)",
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
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: "var(--sky-accent)",
        }}
      />
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        최근 공시{" "}
        <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-secondary)" }}>
          (최근 3개월)
        </span>
      </h3>
    </div>

    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      <DisclosureRow
        badge="소유상황"
        badgeBg="var(--lavender-bg)"
        badgeColor="var(--lavender-accent)"
        title="주식등의대량보유상황보고서(일반)"
        date="2026.05.04"
        filer="삼성물산"
      />
      <DisclosureRow
        badge="정기보고서"
        badgeBg="var(--sky-bg)"
        badgeColor="var(--sky-accent)"
        title="사업보고서 (2025.12)"
        date="2026.03.31"
        filer="삼성전자"
      />
      <DisclosureRow
        badge="주요사항"
        badgeBg="var(--sage-bg)"
        badgeColor="var(--sage-accent)"
        title="주요사항보고서(유상증자결정)"
        date="2026.02.14"
        filer="삼성전자"
      />
    </ul>
  </div>
);

export const InContextPreview = () => (
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
      In-Context Preview
    </h2>
    <p
      style={{
        fontSize: "13px",
        color: "var(--text-secondary)",
        marginBottom: "24px",
      }}
    >
      실제 데이터 형태에 새 토큰 적용 시 시각적 결과 — 더미 데이터
    </p>

    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <StockHeaderPanel />
      <MetricsPanel />
      <DisclosuresPanel />
    </div>
  </section>
);
