import { Info } from "lucide-react";

type NonKrwNoticeProps = {
  currency: string;
  showBoundary?: boolean;
};

export const NonKrwNotice = ({ currency, showBoundary = true }: NonKrwNoticeProps) => (
  <div className="flex items-start gap-2.5">
    <Info
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
    />
    <div className="space-y-1">
      <p className="text-body font-medium">재무 데이터 제공 제한</p>
      <p className="text-body text-muted-foreground">
        {`이 종목은 재무제표를 원화가 아닌 통화(${currency})로 공시해 재무 기반 지표를 확인할 수 없어요`}
      </p>
      {showBoundary && (
        <p className="text-caption text-muted-foreground/70">
          가격·거래량·공시 정보는 정상 제공돼요
        </p>
      )}
    </div>
  </div>
);
