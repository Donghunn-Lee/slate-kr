-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- F89: daily_prices 의 저장 축은 KIS 수정주가다. 병합·분할 뒤 date <= 2026-09-11 행은
--      backfill_prices_kis.py 가 KIS 수정주가로 재적재하지만, 2026-09-14 이후 행(20:00 축,
--      fetch_daily_close.py 소관)은 재적재 대상 밖이라 구 스케일로 남는다 → 여기서 수동 rescale.
-- 절차: ① 20:12 job 로그(daily_close_{YYYYMMDD}.log)의 corporate action suspected WARN 에서
--         kis_adj=1 확인 — 0 이면 감자(KIS 미조정)라 손대지 않는다
--       ② python backfill_prices_kis.py --tickers <ticker>  (≤ 2026-09-11 행 재적재)
--       ③ 아래 UPDATE — <ticker> · <event_date>(WARN 난 거래일) · <factor> 치환
-- <factor> 는 WARN 의 f 를 쓰지 않는다 — 로그가 %.2f 라 반올림되고(2.12 vs 참값 2.1205),
--   f 는 20:00 종가 기준이라 애프터마켓 체결이 있으면 KIS 정규장 종가와 어긋난다.
--   ② 재적재 전에 9/11 행에서 KIS 수정 종가 ÷ DB 종가 로 구해 둔다 — 재적재 뒤에는 1.0 이 된다.
-- volume 은 KIS 역보정 관례(÷factor) — 정지 구간은 0 이라 무관, 실거래 구간이면 volume 행을 추가한다.
-- 권리락은 전 열 ×factor 가 아니라 실거래 패턴 — 별도 판단.

-- ── 검증 SELECT (기대: 2026-09-14 ~ event_date 직전 거래일의 행 수, 구 스케일 close) ──
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '<ticker>'
  AND date >= '2026-09-14'
  AND date < '<event_date>';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * <factor>),
    high       = ROUND(high       * <factor>),
    low        = ROUND(low        * <factor>),
    close      = ROUND(close      * <factor>),
    base_price = ROUND(base_price * <factor>)
WHERE ticker = '<ticker>'
  AND date >= '2026-09-14'
  AND date < '<event_date>';
-- 예상 UPDATE 카운트: 검증 SELECT 의 rows_to_rescale

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
