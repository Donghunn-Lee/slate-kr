// 표시통화가 KRW 가 아닌 상장 종목 → 표시 통화 매핑 (#117).
// 이 종목들의 DART 재무제표는 USD·CNY 등으로 공시되어 KRW 원 단위 저장 전제
// 위반을 이유로 수집 파이프라인이 격리(NULL) 처리한다. UI 는 이 매핑을 참조해
// 재무 슬레이트·핵심 지표에서 "재무 데이터 제공 제한" 안내와 현재 통화를 노출한다.
//
// Single source of truth 는 collector/fetch_financials.py 의 KNOWN_NON_KRW_TICKERS.
// collector 목록·티커별 통화 주석이 바뀌면 이 파일의 값도 동기화할 것.
//
// 전환 이력(예: CNY→USD, HKD→USD) 종목은 이력 서사 없이 "현재 통화"만 노출한다.
// 950260 은 collector 에 통화 미명시(적재 이력 없음)이나, 95xxxx 대(KOSDAQ 외국
// 기업 secondary listing) 관례상 USD 로 표기.

export const NON_KRW_TICKER_CURRENCIES: Readonly<Record<string, string>> = {
  "241560": "USD",
  "008700": "USD",
  "900070": "USD",
  "900120": "CNY",
  "900300": "CNY",
  "950130": "USD",
  "950140": "USD",
  "950160": "USD",
  "950190": "USD",
  "950200": "USD",
  "950210": "USD",
  "950220": "USD",
  "950260": "USD",
};

export const isNonKrwTicker = (ticker: string): boolean =>
  Object.hasOwn(NON_KRW_TICKER_CURRENCIES, ticker);

export const getNonKrwCurrency = (ticker: string): string | null =>
  NON_KRW_TICKER_CURRENCIES[ticker] ?? null;
