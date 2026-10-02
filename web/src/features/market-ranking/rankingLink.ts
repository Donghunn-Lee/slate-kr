import type { MarketRankingItem } from "@/shared/types/ranking";

// 순위 TR 은 stocks 미등록 종목(ETF·신규상장 등)도 돌려주고, 그 상세 페이지는 404 다.
// market 부재가 미등록을 뜻하는 건 매핑 조회가 성공했을 때뿐 — 조회 실패면 근거가 없으므로 링크를 유지한다.
export const isRankingRowLinkable = (
  item: Pick<MarketRankingItem, "market">,
  marketResolved: boolean,
): boolean => !marketResolved || item.market !== undefined;
