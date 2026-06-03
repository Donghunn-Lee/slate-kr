import type { Metadata } from "next";
import { ColorTokens } from "./sections/ColorTokens";
import { Typography } from "./sections/Typography";
import { SlatePanels } from "./sections/SlatePanels";
import { Tabs } from "./sections/Tabs";
import { MotionTokens } from "./sections/MotionTokens";

export const metadata: Metadata = {
  title: "Styleguide — SlateKR",
  robots: { index: false },
};

export default function StyleguidePage() {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-[960px]">
        {/* 헤더 */}
        <div className="mb-12">
          <h1 className="mb-2 text-[28px] font-bold tracking-[-0.02em] text-foreground">
            SlateKR 디자인 시스템
          </h1>
          <p className="text-sm leading-[1.6] text-muted-foreground">
            SlateKR에서 사용하는 색·타이포·모션 토큰 가이드
          </p>
          <div className="mt-4 flex gap-2 font-mono text-[11px] text-muted-foreground">
            {["Base", "Functional", "Accent ×5", "Disclosure", "Tabs", "Motion", "Shadow"].map((tag) => (
              <span key={tag} className="rounded bg-subtle px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 섹션 */}
        <div className="flex flex-col gap-16">
          <ColorTokens />
          <Typography />
          <SlatePanels />
          <Tabs />
          <MotionTokens />
        </div>

        {/* 푸터 */}
        <div className="mt-16 border-t border-subtle pt-6 text-xs text-muted-foreground">
          이 페이지는 개발 전용 디자인 시스템 문서입니다. 실제 서비스 기능과 무관합니다.
        </div>
      </div>
    </div>
  );
}
