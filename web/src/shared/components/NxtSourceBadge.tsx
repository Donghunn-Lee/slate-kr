// "일시 지연" 배지와 동일한 무채색 outline. 심각도·분류 신호가 아니라 출처 사실
// 표기라서 색 있는 배지(CheckpointBadge·MarketActionBadge) 계열을 쓰지 않는다.
// 라벨은 공식 시장 명칭 그대로 — "대체거래소"는 리스트 행 폭을 넘긴다.
// 툴팁은 터치 기기에서 동작하지 않아 설명은 /credits 데이터 출처 항목에 둔다.
export const NxtSourceBadge = () => (
  <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
    NXT
  </span>
);
