-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
-- 절차: ① 검증 SELECT 가 7 티커 모두 rows = 21, all_null = 0 (합계 147) 인지 확인 — 다르면 실행하지 않고 차이를 보고
--       ② 일치하면 BEGIN~COMMIT 블록 실행. UPDATE 카운트도 147 이어야 하며 아니면 ROLLBACK
--       ③ 이후 collector KNOWN_NON_KRW_TICKERS · web NON_KRW_TICKER_CURRENCIES 에 7 티커 등록
--
-- 900100(USD)·900110·900250·900260·900270·900310·900340(CNY): 표시통화 게이트 도입 전에
--      비-KRW 금액이 원 단위로 적재됐고, fetch_financials 는 기존 키를 skip 하므로 게이트가
--      이 행들을 다시 검사하지 않는다. 적재값 스케일이 2021 Q1~2026 Q1 전 기간 연속 → 전 기간 격리.
-- 행은 지우지 않고 수치 7컬럼만 NULL — 행을 지우면 매 수집마다 DART 재조회·known WARN 이
--      반복되고, total_equity 를 남기면 backfill_bps 가 bps 를 다시 채운다.

-- ── 검증 SELECT (기대: 7 티커 × rows = 21, all_null = 0) ──
SELECT ticker,
       count(*) AS rows,
       count(*) FILTER (
         WHERE revenue IS NULL AND operating_profit IS NULL AND net_income IS NULL
           AND total_assets IS NULL AND total_equity IS NULL AND eps IS NULL AND bps IS NULL
       ) AS all_null
FROM financial_statements
WHERE ticker IN ('900100','900110','900250','900260','900270','900310','900340')
GROUP BY ticker
ORDER BY ticker;

BEGIN;

UPDATE financial_statements
SET revenue          = NULL,
    operating_profit = NULL,
    net_income       = NULL,
    total_assets     = NULL,
    total_equity     = NULL,
    eps              = NULL,
    bps              = NULL
WHERE ticker IN ('900100','900110','900250','900260','900270','900310','900340');
-- 예상 UPDATE 카운트: 147

-- 정정 후 확인 (COMMIT 전 검수): 검증 SELECT 재실행 → 7 티커 모두 rows = all_null = 21

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
