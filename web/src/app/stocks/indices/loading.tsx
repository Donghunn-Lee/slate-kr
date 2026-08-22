// detail pane 총 높이는 실제 헤더 + 본문 + 차트 총합의 근사값(정확값 미고정).
export default function Loading() {
  return (
    <main className="container mx-auto max-w-6xl space-y-3 px-4 py-5 sm:space-y-4 sm:py-8">
      <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        {/* 모바일 chip strip 자리. 데스크톱은 hidden. */}
        <div className="h-9 w-full animate-pulse rounded bg-muted md:hidden" />
        {/* Detail pane (mobile 첫번째, desktop 두번째). rounded-lg + lavender 톤 wrapper. */}
        <div className="order-1 min-w-0 flex-1 animate-pulse md:order-2">
          <div className="h-[560px] rounded-lg border border-lavender-border bg-lavender-bg sm:h-[720px]" />
        </div>
        {/* Desktop rail — 모바일 hidden. 국내/해외 섹션 헤더 + 리스트 rows. */}
        <aside className="order-2 hidden animate-pulse md:order-1 md:block md:w-[260px] md:shrink-0">
          <div className="space-y-2">
            <div className="h-8 w-16 rounded bg-muted" />
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`d${i}`} className="h-14 w-full rounded-md bg-muted" />
              ))}
            </div>
            <div className="mt-3 h-8 w-16 rounded bg-muted" />
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`o${i}`} className="h-14 w-full rounded-md bg-muted" />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
