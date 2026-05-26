import type { Metadata } from "next";
import { ColorTokens } from "./sections/ColorTokens";
import { Typography } from "./sections/Typography";
import { SlatePanels } from "./sections/SlatePanels";
import { MotionTokens } from "./sections/MotionTokens";

export const metadata: Metadata = {
  title: "Styleguide — SlateKR",
  robots: { index: false },
};

export default function StyleguidePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-base)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* 헤더 */}
        <div style={{ marginBottom: "48px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            SlateKR 디자인 시스템
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            SlateKR에서 사용하는 색·타이포·모션 토큰 가이드
          </p>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "16px",
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--text-tertiary)",
            }}
          >
            {["Base", "Functional", "Accent ×5", "Disclosure", "Motion", "Shadow"].map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: "var(--border-subtle)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 섹션 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "64px" }}>
          <ColorTokens />
          <Typography />
          <SlatePanels />
          <MotionTokens />
        </div>

        {/* 푸터 */}
        <div
          style={{
            marginTop: "64px",
            paddingTop: "24px",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "12px",
            color: "var(--text-tertiary)",
          }}
        >
          이 페이지는 개발 전용 디자인 시스템 문서입니다. 실제 서비스 기능과 무관합니다.
        </div>
      </div>
    </div>
  );
}
