-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- 033340 좋은사람들의 2026-09-14 ~ 2026-10-13 행을 KIS 수정주가 축으로 rescale.
-- 템플릿: rescale_corporate_action.sql. ≤ 2026-09-11 행은 backfill_prices_kis.py --tickers 로
--   재적재를 마쳤다 (2026-10-14). factor = 재적재 후 9/11 close ÷ 재적재 전 9/11 close.
-- 사건: 액면가 감액 무상감자(500 → 100원, 주식수 불변) + 주식병합 5:1, 2026-10-14 변경상장.
--   기준가 2400 이 병합 이론가(460 × 5 = 2300)와 달라 factor 가 정수가 아니다 (131400 선례).
-- 절차: ① 검증 SELECT 가 블록 머리의 기대값(행 수 · 구간 · close 범위)과 같은지 확인 —
--         다르면 실행하지 않고 보고
--       ② 같으면 BEGIN ~ COMMIT. UPDATE 카운트가 기대 행 수와 다르면 COMMIT 대신 ROLLBACK

-- ══ 033340 좋은사람들 · event 2026-10-14 ══
-- 구간 2026-09-14 ~ 2026-10-13 · 18행 · factor 5.215217 (9/11 close 460 → 2399)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 18 · 2026-09-14 ~ 2026-10-13 · close 460 ~ 460
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '033340'
  AND date >= '2026-09-14'
  AND date < '2026-10-14';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.215217),
    high       = ROUND(high       * 5.215217),
    low        = ROUND(low        * 5.215217),
    close      = ROUND(close      * 5.215217),
    base_price = ROUND(base_price * 5.215217)
WHERE ticker = '033340'
  AND date >= '2026-09-14'
  AND date < '2026-10-14';
-- 예상 UPDATE 카운트: 18

COMMIT;
