-- 추적용 기록 — collector/rescale_corp_actions.py 가 2026-10-22 에 적용했다 (원장 corp_action_rescales).
--   다시 실행하지 않는다: 적용된 행에 ×factor 가 한 번 더 들어간다.
--
-- 368600 아이씨에이치의 2026-09-14 ~ 2026-10-21 행을 KIS 수정주가 축으로 rescale.
-- 템플릿: rescale_corporate_action.sql. factor = 재적재 후 9/11 close ÷ 재적재 전 9/11 close.
-- ≤ 2026-09-11 재적재(1,007행)는 아래 UPDATE 와 같은 트랜잭션에서 적용했다.
-- 사건 유형은 DART 로 확인하지 않았다 — 자동 게이트(kis_adj=1 · factor 가 기준가 4780 ÷ 직전 봉 956 과
--   일치 · 구간 한 축)로 판정. 아래 블록은 원장 sql 열 그대로.

-- ══ 368600 아이씨에이치 · event 2026-10-22 ══
-- 구간 2026-09-14 ~ 2026-10-21 · 24행 · factor 5.0 (9/11 close 956 → 4780)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 24 · 2026-09-14 ~ 2026-10-21 · close 956 ~ 956
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '368600'
  AND date >= '2026-09-14'
  AND date < '2026-10-22';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '368600'
  AND date >= '2026-09-14'
  AND date < '2026-10-22';
-- 예상 UPDATE 카운트: 24

COMMIT;
