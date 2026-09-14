// "일시 지연" 배지와 동일한 무채색 outline. 심각도·분류 신호가 아니라 출처 사실
// 표기라서 색 있는 배지(CheckpointBadge·MarketActionBadge) 계열을 쓰지 않는다.
// 라벨을 시장명이 아니라 "장외" 로 두는 이유: KRX 애프터마켓(16:00~20:00)과 NXT
// 프리·애프터마켓 체결이 같은 통합가(UN)로 섞여 들어와 리스트 표면에서는 어느 시장
// 체결인지 특정할 수 없다. "시간외" 는 KRX 시간외 종가매매와 혼동된다.
// 툴팁은 터치 기기에서 동작하지 않아 설명은 /credits 데이터 출처 항목에 둔다.
export const AfterHoursBadge = () => (
  <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
    장외
  </span>
);
