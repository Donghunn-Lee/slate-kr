"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const DisclosureAIHint = () => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex cursor-help items-center gap-1 text-[11px] text-muted-foreground/70 whitespace-nowrap">
        AI 요약
        <Info className="size-3" />
      </span>
    </TooltipTrigger>
    <TooltipContent>공시 탭에서 각 공시별 AI 요약 기능을 사용할 수 있어요</TooltipContent>
  </Tooltip>
);
