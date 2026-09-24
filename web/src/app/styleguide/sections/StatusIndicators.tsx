import { Star } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { EmptyState } from "@/shared/components/EmptyState";
import { StatusBadge } from "@/shared/components/StatusBadge";

export const StatusIndicators = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Status
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      부분 실패·빈 상태 표시 — 판정은 호출처 소관, 여기선 표시만 한다.
    </p>

    <div className="space-y-6">
      <div className="rounded-md border border-subtle bg-elevated p-6">
        <h3 className="mb-2 text-sm font-medium text-foreground">StatusBadge</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">
          부분 실패를 알리는 소형 무채 outline 배지.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="일시 지연" />
          <StatusBadge label="서버 저장 안 됨" />
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          동형 변형: MarketScopeBadge(의미 분리로 별개 유지)
        </p>
      </div>

      <div className="rounded-md border border-subtle bg-elevated p-6">
        <h3 className="mb-2 text-sm font-medium text-foreground">EmptyState</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">
          아이콘 · 제목 · 설명 · 이동 링크로 구성된 빈 상태.
        </p>
        <StockPanel variant="plain" className="py-10">
          <EmptyState
            icon={Star}
            title="관심종목이 없습니다"
            description="종목 상세에서 별표를 누르면 여기에 담깁니다"
            action={{ label: "순위에서 종목 찾기", href: "/ranking" }}
          />
        </StockPanel>
        <p className="mt-4 text-[11px] text-muted-foreground">
          적용 범위: 페이지·탭 레벨 빈 상태만. 위젯·섹션 내 인라인 빈 상태는 대상 아님
        </p>
      </div>
    </div>
  </section>
);
