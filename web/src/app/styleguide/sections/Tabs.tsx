import { cn } from "@/lib/utils";

type TabAccent = "neutral" | "lavender" | "amber" | "sky";

type TabItem = {
  label: string;
  accent: TabAccent;
};

const TABS: TabItem[] = [
  { label: "종합정보", accent: "neutral" },
  { label: "차트", accent: "lavender" },
  { label: "재무", accent: "amber" },
  { label: "공시", accent: "sky" },
];

const ACCENT_CLASSES: Record<TabAccent, string> = {
  neutral: "bg-elevated border-subtle",
  lavender: "bg-lavender-bg border-lavender-border",
  amber: "bg-amber-bg border-amber-border",
  sky: "bg-sky-bg border-sky-border",
};

type FolderTabsProps = {
  tabs: TabItem[];
  activeIndex: number;
};

const FolderTabs = ({ tabs, activeIndex }: FolderTabsProps) => {
  const activeAccent = tabs[activeIndex].accent;

  return (
    <div className="w-full">
      <div className="flex items-end gap-2 pt-2">
        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;

          return (
            <div
              key={tab.label}
              className={cn(
                "relative flex items-center justify-center rounded-t-md border px-6 py-2 text-sm transition-colors",
                ACCENT_CLASSES[tab.accent],
                isActive
                  ? "z-20 -mb-px border-b-transparent font-medium text-foreground"
                  : "z-10 border-b-0 text-muted-foreground opacity-80"
              )}
            >
              {tab.label}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "relative z-10 rounded-md border p-6",
          ACCENT_CLASSES[activeAccent],
          activeIndex === 0 ? "rounded-tl-none" : ""
        )}
      >
        <p className="text-sm text-muted-foreground">{tabs[activeIndex]?.label} 콘텐츠 영역</p>
      </div>
    </div>
  );
};

export const Tabs = () => (
  <section>
    <h2 className="mb-6 border-b border-subtle pb-3 text-lg font-semibold text-foreground">Tabs</h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      종목 상세 페이지의 폴더 탭 패턴. 활성 탭이 콘텐츠 패널과 연결되어 하나의 폴더로 읽힌다.
      차트=lavender, 재무=amber, 공시=sky, 종합정보=무채색.
    </p>

    <FolderTabs tabs={TABS} activeIndex={0} />
  </section>
);
