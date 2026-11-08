"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMounted } from "@/shared/hooks/useMounted";

const STORAGE_KEY = "slatekr_demo_notice";
// 문구를 바꾸면 올린다 — 이전 버전을 닫은 방문자에게도 다시 뜬다.
const NOTICE_VERSION = "v1";

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

export const DemoNoticeDialog = () => {
  // 저장소는 마운트 뒤에만 읽는다 — 서버 · hydration 렌더는 닫힌 상태.
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);
  const open = mounted && !dismissed && !hasSeenNotice();

  const dismiss = () => {
    markNoticeSeen();
    setDismissed(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>가상 시세 데모입니다</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body break-keep">
              <p>
                시세 라이선스 제약으로 시세 · 지수 · 순위 · 차트의 가격은 실제 시장 데이터가 아닌
                가상 데이터입니다. 가격대만 종목별 DART 공시(배당 · 재무)에 맞췄고, 매일의 움직임은
                생성기가 만듭니다.
              </p>
              <p>
                재무제표 · 공시 · 공시 AI 요약은 DART 실데이터입니다. 가격이 실제와 다르므로 투자
                판단에 사용할 수 없습니다.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* 링크라 DialogClose 로 감싸지 않고 직접 닫는다 — 나머지 닫기 경로는 onOpenChange 로 온다. */}
          <Button variant="outline" asChild>
            <Link href="/credits#demo" onClick={dismiss}>
              자세히 보기
            </Link>
          </Button>
          <DialogClose asChild>
            <Button>확인</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
