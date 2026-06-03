type TabAccent = "lavender" | "sage" | "amber";

type TabItem = {
  label: string;
  accent?: TabAccent;
};

const ACCENT_TABS: TabItem[] = [
  { label: "종합정보" },
  { label: "차트", accent: "lavender" },
  { label: "재무", accent: "sage" },
  { label: "공시", accent: "amber" },
];

const INACTIVE_ACCENT_CLASSES: Record<TabAccent, string> = {
  lavender: "border-lavender-border bg-lavender-bg text-muted-foreground",
  sage: "border-sage-border bg-sage-bg text-muted-foreground",
  amber: "border-amber-border bg-amber-bg text-muted-foreground",
};

const TAB_Z_CLASSES = ["z-40", "z-30", "z-20", "z-10"] as const;

type FolderTabsProps = {
  tabs: TabItem[];
  activeIndex: number;
};

const FolderTabs = ({ tabs, activeIndex }: FolderTabsProps) => {
  const panelCornerClass =
    activeIndex === 0
      ? "rounded-md rounded-tl-none"
      : activeIndex === tabs.length - 1
        ? "rounded-md rounded-tr-none"
        : "rounded-md";

  return (
    <div>
      <div className="-mb-px flex">
        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;
          const overlap = i > 0 ? "-ml-1.5" : "";
          const zClass = TAB_Z_CLASSES[i] ?? "z-10";
          const commonClasses = `relative ${zClass} rounded-t-md px-4 py-2 text-sm ${overlap}`;

          if (isActive) {
            return (
              <div
                key={tab.label}
                className={`${commonClasses} border border-b-0 border-subtle bg-elevated font-medium text-foreground`}
              >
                {tab.label}
              </div>
            );
          }
          const inactiveClasses = tab.accent
            ? INACTIVE_ACCENT_CLASSES[tab.accent]
            : "border-subtle bg-muted text-muted-foreground";
          return (
            <div key={tab.label} className={`${commonClasses} border ${inactiveClasses}`}>
              {tab.label}
            </div>
          );
        })}
      </div>
      <div
        className={`flex min-h-[200px] items-center justify-center border border-subtle bg-elevated px-6 ${panelCornerClass}`}
      >
        <p className="text-sm text-muted-foreground">
          {tabs[activeIndex]?.label} 콘텐츠 영역
        </p>
      </div>
    </div>
  );
};

export const Tabs = () => (
  <section>
    <h2 className="mb-6 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Tabs
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      종목 상세 페이지의 폴더 탭 패턴. 활성 탭이 콘텐츠 패널과 연결되어 하나의 폴더로 읽힌다.
      차트=lavender, 재무=sage, 공시=amber, 종합정보=무채색.
    </p>

    <FolderTabs tabs={ACCENT_TABS} activeIndex={0} />
  </section>
);
