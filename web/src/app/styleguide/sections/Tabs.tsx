type TabAccent = "sage" | "amber";

type TabItem = {
  label: string;
  accent?: TabAccent;
};

const NEUTRAL_TABS: TabItem[] = [
  { label: "종합정보" },
  { label: "차트" },
  { label: "재무" },
  { label: "공시" },
];

const ACCENT_TABS: TabItem[] = [
  { label: "종합정보" },
  { label: "차트" },
  { label: "재무", accent: "sage" },
  { label: "공시", accent: "amber" },
];

const INACTIVE_ACCENT_CLASSES: Record<TabAccent, string> = {
  sage: "border-sage-border bg-sage-bg text-muted-foreground",
  amber: "border-amber-border bg-amber-bg text-muted-foreground",
};

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
      <div className="-mb-px flex gap-1">
        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;
          if (isActive) {
            return (
              <div
                key={tab.label}
                className="relative z-10 rounded-t-md border border-b-0 border-subtle bg-elevated px-4 py-2 text-sm font-medium text-foreground"
              >
                {tab.label}
              </div>
            );
          }
          const inactiveClasses = tab.accent
            ? INACTIVE_ACCENT_CLASSES[tab.accent]
            : "border-subtle bg-muted text-muted-foreground";
          return (
            <div
              key={tab.label}
              className={`rounded-t-md border px-4 py-2 text-sm ${inactiveClasses}`}
            >
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
    </p>

    <div className="flex flex-col gap-10">
      <div>
        <p className="mb-3 text-xs text-muted-foreground">데모 1 — 기본형 (비활성 무채색)</p>
        <FolderTabs tabs={NEUTRAL_TABS} activeIndex={0} />
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">데모 2 — 비활성 액센트 매핑</p>
        <FolderTabs tabs={ACCENT_TABS} activeIndex={0} />
      </div>
    </div>
  </section>
);
