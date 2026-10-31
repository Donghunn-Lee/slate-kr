-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- stocks.reporting_currency: 재무제표 표시통화(기본 'KRW'). non-KRW 종목의 단일 소스 — collector
-- fetch_financials 의 known skip·자동 격리와 web 의 재무 안내가 모두 이 컬럼을 읽는다.
-- reporting_currency_at 은 컬럼이 KRW 밖으로 바뀐 시각 — 시드 20 티커는 NULL (게이트 도입 전 수동 격리).
-- 시드 티커는 수치 7컬럼 격리(NULL)가 끝난 상태다(web/sql/financial_statements_non_krw_isolation.sql).
-- 241560 은 2023 사업보고서부터 USD 라 KRW 기간 행은 값이 남아 있는 게 맞다.
--
-- 절차: ① 검증 SELECT — 첫 쿼리 0행(컬럼 없음) · 둘째 쿼리 active = 20 이어야 한다
--       ② 일치하면 BEGIN~COMMIT 블록 실행. 시드 UPDATE 카운트도 20 이어야 하며 아니면 ROLLBACK
--       ③ 그 뒤 collector·web 배포 — weekly fetch_financials 가 이 컬럼을 SELECT 하므로 순서가 바뀌면 run 이 깨진다

-- ── 검증 SELECT ──
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'stocks' AND column_name IN ('reporting_currency', 'reporting_currency_at');

SELECT count(*) AS active
FROM stocks
WHERE is_active
  AND ticker IN ('241560','008700','900070','900100','900110','900120','900250','900260','900270','900300',
                 '900310','900340','950130','950140','950160','950190','950200','950210','950220','950260');

BEGIN;

ALTER TABLE stocks
  ADD COLUMN reporting_currency    varchar(3)  NOT NULL DEFAULT 'KRW',
  ADD COLUMN reporting_currency_at timestamptz;

UPDATE stocks AS s
SET reporting_currency = v.currency
FROM (VALUES
  ('241560', 'USD'),  -- 두산밥캣 (2023 사업보고서~)
  ('008700', 'USD'),  -- 아남전자
  ('900070', 'USD'),  -- 글로벌에스엠 (CNY→USD)
  ('900100', 'USD'),  -- 파이온엑스
  ('900110', 'CNY'),  -- 딥커머스
  ('900120', 'CNY'),  -- 씨엑스아이
  ('900250', 'CNY'),  -- 크리스탈신소재
  ('900260', 'CNY'),  -- 로스웰
  ('900270', 'CNY'),  -- 헝셩그룹
  ('900300', 'CNY'),  -- 오가닉티코스메틱
  ('900310', 'CNY'),  -- 컬러레이
  ('900340', 'CNY'),  -- 윙입푸드
  ('950130', 'USD'),  -- 엑세스바이오
  ('950140', 'USD'),  -- 잉글우드랩
  ('950160', 'USD'),  -- 코오롱티슈진
  ('950190', 'USD'),  -- 고스트스튜디오 (HKD→USD)
  ('950200', 'USD'),  -- 소마젠
  ('950210', 'USD'),  -- 프레스티지바이오파마
  ('950220', 'USD'),  -- 네오이뮨텍
  ('950260', 'USD')   -- 인제니아테라퓨틱스 (적재 이력 없음 — 95xxxx 관례상 USD)
) AS v(ticker, currency)
WHERE s.ticker = v.ticker;
-- 예상 UPDATE 카운트: 20

-- COMMIT 전 검수: SELECT ticker, reporting_currency FROM stocks WHERE reporting_currency <> 'KRW' ORDER BY ticker; → 20행

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
