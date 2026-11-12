"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMounted } from "@/shared/hooks/useMounted";

const STORAGE_KEY = "slatekr_demo_notice";
// 문구를 바꾸면 올린다 — 이전 버전을 닫은 방문자에게도 다시 뜬다.
const NOTICE_VERSION = "v1";

const EMPHASIS = "font-semibold text-foreground";

const hasSeenNotice = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === NOTICE_VERSION;
  } catch {
    // 저장소가 막힌 브라우저는 접근 자체가 throw 한다 — 안 본 것으로 보고 연다.
    return false;
  }
};

const markNoticeSeen = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, NOTICE_VERSION);
  } catch {
    // 기록 실패는 이번 화면에서만 닫힐 뿐 — 다음 방문에 다시 뜬다.
  }
};

// 결정을 요구하지 않는 안내라 모달로 화면을 막지 않고, 포커스도 가져가지 않는다.
export const DemoNotice = () => {
  // 저장소는 마운트 뒤에만 읽는다 — 서버 · hydration 렌더는 닫힌 상태.
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);
  const titleId = useId();

  if (!mounted || dismissed || hasSeenNotice()) return null;

  const dismiss = () => {
    markNoticeSeen();
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        // 탭 바 · 맨 위로 버튼(z-40)과 겹치면 카드가 위.
        "fixed inset-x-4 z-50 flex flex-col gap-3 rounded-lg border border-default bg-elevated p-4 shadow-slate",
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] md:inset-x-auto md:right-4 md:bottom-4 md:w-88",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
      )}
    >
      <h2 id={titleId} className="flex items-center gap-2 text-body font-semibold text-foreground">
        <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
        가상 시세 데모
      </h2>
      <div className="space-y-1.5 break-keep">
        <p className="text-body-sm text-muted-foreground">
          시세 · 지수 · 순위 · 차트의 <strong className={EMPHASIS}>가격</strong>은{" "}
          <strong className={EMPHASIS}>가상 데이터</strong>입니다. 재무제표 · 공시는 DART
          실데이터입니다.
        </p>
        <p className="text-caption text-muted-foreground">
          시세 라이선스 제약으로 공개 데모는 가상 시세로 운영합니다. 실제 가격과 다르므로 투자
          판단에 사용하지 마세요.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/credits#demo" onClick={dismiss}>
            자세히
          </Link>
        </Button>
        <Button size="sm" onClick={dismiss}>
          확인
        </Button>
      </div>
    </div>
  );
};
