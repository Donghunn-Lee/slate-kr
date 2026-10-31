-- 수동 처리용 템플릿: weekly fetch_financials 의 자동 격리가 거절한 non-KRW 종목([NON_KRW_DECLINED],
-- artifact non-krw-<run id> 의 summary.json 에 사유). 게이트를 전부 통과한 건은 같은 블록을 run 안에서
-- 자동 적용하고 artifact 에 isolate_<ticker>.sql · <ticker>_before.json 을 남긴다.
-- 행은 지우지 않고 수치 7컬럼만 NULL — 행을 지우면 매 수집마다 DART 재조회·known WARN 이 반복되고,
-- total_equity 를 남기면 sync_bps 가 bps 를 다시 채운다.
--
-- 절차: ① 거절 사유를 먼저 본다 — 직전 period 가 KRW 면 표시통화 전환 시점을 DART 원문으로 확인하고
--          KRW 기간 행은 NULL 대상에서 뺀다(241560 선례: WHERE 에 year 조건 추가)
--       ② 검증 SELECT 의 rows 를 기대 카운트로 삼아 BEGIN~COMMIT 실행. UPDATE 카운트가 다르면 ROLLBACK
--       ③ 다음 weekly run 부터 known skip(WARN·exit 미기여)으로 처리된다. 코드·배포 변경 없음
-- 치환: {TICKER} 종목코드 · {CUR} ISO 통화코드(USD·CNY·JPY …)

-- ── 검증 SELECT (기대: all_null = 0, rows 는 격리 대상 행 수) ──
SELECT count(*) AS rows,
       count(*) FILTER (
         WHERE revenue IS NULL AND operating_profit IS NULL AND net_income IS NULL
           AND total_assets IS NULL AND total_equity IS NULL AND eps IS NULL AND bps IS NULL
       ) AS all_null
FROM financial_statements
WHERE ticker = '{TICKER}';

BEGIN;

UPDATE financial_statements
SET revenue          = NULL,
    operating_profit = NULL,
    net_income       = NULL,
    total_assets     = NULL,
    total_equity     = NULL,
    eps              = NULL,
    bps              = NULL
WHERE ticker = '{TICKER}';
-- 예상 UPDATE 카운트: 검증 SELECT 의 rows

UPDATE stocks
SET reporting_currency = '{CUR}', reporting_currency_at = now()
WHERE ticker = '{TICKER}' AND reporting_currency = 'KRW';
-- 예상 UPDATE 카운트: 1

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
