import type { KrxSession } from "@/shared/utils/market";
import { isKrxBeforeMarketOpen } from "@/shared/utils/market";

// "일시 지연" 배지와 동일한 무채색 outline. 심각도·분류 신호가 아니라 출처 사실
// 표기라서 색 있는 배지(CheckpointBadge·MarketActionBadge) 계열을 쓰지 않는다.
// 라벨은 시장명이 아니라 세션명 — KRX 애프터마켓(16:00~20:00)과 NXT 프리·애프터마켓
// 체결이 같은 통합가(UN)로 섞여 들어와 리스트 표면에서는 어느 시장 체결인지 특정할 수
// 없지만, 어느 세션인지는 정규장 개장 전(프리)·후(애프터)로 가를 수 있다.
// 표시 여부는 shouldShowAfterHoursBadge 소관 — 여기서는 세션으로 단어만 고른다.
// 툴팁은 터치 기기에서 동작하지 않아 설명은 /credits 데이터 출처 항목에 둔다.
type AfterHoursBadgeProps = {
  session: KrxSession | undefined;
};

export const AfterHoursBadge = ({ session }: AfterHoursBadgeProps) => (
  <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
    {isKrxBeforeMarketOpen(session) ? "프리" : "애프터"}
  </span>
);
