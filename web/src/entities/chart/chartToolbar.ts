import { CandlestickChart, LineChart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// 차트 툴바 공용 타입·상수·클래스. IndexChart · StockChartTabs 공유.
// 데스크톱(sm+) 은 StockChartTabs #105 정합 상태(h-7/w-14/px-2) 를 유지,
// 모바일은 좁은 뷰포트 1행 성립을 위해 h-6/w-12/px-1.5 로 축소.

export type ViewMode = "intraday" | "full";
export type Granularity = "day" | "week" | "month";
export type SeriesKind = "candle" | "line";

export const VIEW_MODE_BUTTONS: { value: ViewMode; label: string }[] = [
  { value: "intraday", label: "당일" },
  { value: "full", label: "전체" },
];

export const GRANULARITY_BUTTONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" },
];

export const SERIES_KIND_BUTTONS: {
  value: SeriesKind;
  label: string;
  Icon: LucideIcon;
}[] = [
  { value: "candle", label: "캔들", Icon: CandlestickChart },
  { value: "line", label: "선", Icon: LineChart },
];

// 모든 컨트롤(그룹 wrapper·input) 은 동일 고정 높이를 공유 — 툴바 요소들이
// 콘텐츠 폭·구성과 무관하게 시각적으로 정렬되게 한다. 모바일 h-6 은 좁은
// 뷰포트 1행 성립을 위한 축소분 — 오탭 체감 우려 시 sm+ 처방을 revert 경로로.
export const TOOLBAR_GROUP_CLS =
  "inline-flex h-6 items-stretch gap-0.5 rounded-md border border-subtle bg-elevated p-0.5 sm:h-7";

// 봉 개수 input — TOOLBAR_GROUP_CLS 와 동일 축(h-6/h-7, w-12/w-14). opacity-40 은 caller 조건부.
export const TOOLBAR_INPUT_CLS = cn(
  "h-6 w-12 rounded-md border border-subtle bg-elevated px-2 text-caption text-foreground sm:h-7 sm:w-14",
  "focus:border-lavender-border focus:outline-none",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

// 선택 상태 색은 차트 섹션(무채색 원칙) 의 예외 — 툴바 강조에 한해 lavender 사용.
// 높이는 wrapper 가 통제하고 버튼은 items-stretch 로 채운다 —
// py-* 로 컨텐츠 기반 높이 잡으면 아이콘/텍스트 버튼 사이 미세 차이 발생.
// 모바일 px-1.5 는 그룹 wrapper h-6 축소와 세트로 좁은 뷰포트 1행 성립을 노림.
export const TOOLBAR_BUTTON_CLS = (active: boolean, disabled = false) =>
  cn(
    "inline-flex items-center justify-center rounded-sm px-1.5 text-caption transition-colors sm:px-2",
    active
      ? "bg-lavender-bg text-lavender-accent font-medium"
      : "text-muted-foreground",
    !disabled && !active && "hover:text-foreground",
    disabled && "opacity-40",
  );
