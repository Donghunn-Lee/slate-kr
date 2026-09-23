type SectionErrorProps = {
  title: string;
  message: string;
};

// 종목 상세 섹션의 조회 실패 표시 — 섹션 제목은 유지하고 본문만 실패 문구로 대체.
export const SectionError = ({ title, message }: SectionErrorProps) => (
  <>
    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
    <p className="text-sm text-muted-foreground">{message}</p>
  </>
);
