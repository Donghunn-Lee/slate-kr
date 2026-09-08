"use client";

import { RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ResetViewButtonProps = {
  onClick: () => void;
};

// 툴바 "기본 배율" 버튼 — 봉수 input 우측. 클릭 시 상위에서 resetKey 카운터를 증가시켜
// PriceChart 가 현재 뷰(intraday/EOD)의 초기 visible range 를 재적용하게 한다.
// 높이·프레임을 TOOLBAR_GROUP_CLS 와 동일하게 맞춰 다른 툴바 요소와 정렬. 단일 아이콘
// 버튼이므로 그룹 wrapper 대신 자체적으로 border/bg/rounded 를 적용.
export const ResetViewButton = ({ onClick }: ResetViewButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="기본 배율"
        onClick={onClick}
        className="inline-flex h-6 items-center justify-center rounded-md border border-subtle bg-elevated px-1.5 text-muted-foreground transition-colors hover:text-foreground sm:h-7 sm:px-2"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="text-caption">
      기본 배율
    </TooltipContent>
  </Tooltip>
);
