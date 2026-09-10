-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
-- 절차: ① 검증 SELECT 의 rows_to_fix 가 3328 (191 종목) 인지 확인 — 다르면 실행하지 않고 차이를 보고
--       ② 일치하면 BEGIN~COMMIT 블록 실행. UPDATE 카운트도 3328 이어야 하며 아니면 ROLLBACK
--
-- F90: financial_statements 적재 시점에 stocks.shares 가 NULL 이던 종목(09-05 fetch_shares
--      "의결권 있는 주식" 라벨 수정 전 no_row)은 bps 가 NULL 로 들어갔고, fetch_financials 는
--      기존 키를 skip 하므로 shares 가 채워진 뒤에도 재계산되지 않는다.
-- 계산식: fetch_financials.insert_financial 과 동일 — round(total_equity / shares, 4).
--      total_equity·shares 모두 bigint 이므로 ::numeric 캐스팅 없이는 정수 나눗셈이 된다.
--      (bps 컬럼은 numeric(15,4))

-- ── 검증 SELECT (기대: rows_to_fix = 3328, tickers = 191) ──
SELECT count(*) AS rows_to_fix, count(DISTINCT f.ticker) AS tickers
FROM financial_statements f
JOIN stocks s ON s.ticker = f.ticker
WHERE f.bps IS NULL
  AND f.total_equity IS NOT NULL
  AND s.shares IS NOT NULL
  AND s.shares > 0;

BEGIN;

UPDATE financial_statements f
SET bps = ROUND(f.total_equity::numeric / s.shares, 4)
FROM stocks s
WHERE s.ticker = f.ticker
  AND f.bps IS NULL
  AND f.total_equity IS NOT NULL
  AND s.shares IS NOT NULL
  AND s.shares > 0;
-- 예상 UPDATE 카운트: 3328

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
