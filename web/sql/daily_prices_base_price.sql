-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- base_price = 그 거래일의 KRX 기준가(전일 15:30 정규장 종가, 권리락일은 조정 기준가).
-- daily_prices.close 는 20:00 마감 캔들이라 인접 행 close 차이는 KIS·quote_snapshots 의
-- 등락률 축과 어긋난다 — 등락·등락률은 close − base_price 로 계산하고, NULL 인 행은
-- 직전 거래일 close 로 폴백한다. 2026-09-16 부터는 fetch_daily_close.py 가 KIS
-- inter2_sdpr 로 채운다.

-- ── ① DDL ──
ALTER TABLE daily_prices ADD COLUMN IF NOT EXISTS base_price integer;

-- ── ② 2026-09-14 · 09-15 초기화 ──
-- 소스는 quote_snapshots 의 un_close − un_change (un_change 는 KIS prdy_vrss 라 기준가 축).
-- backfill_prices.py 재적재 뒤에 실행한다 — 백필 upsert 는 base_price 를 건드리지 않고,
-- 9/15 는 재적재가 새로 만드는 행이 대부분이라 그 전에 돌리면 채울 행이 없다.
-- 검증 SELECT: rows_to_fill 이 날짜별 daily_prices 행 수(2026-09-14 ≈ 2,651)와
-- un_close = 0 인 소수(≤ 3)만큼만 달라야 한다.
SELECT d.date, count(*) AS rows_to_fill
FROM daily_prices d
JOIN quote_snapshots q ON q.ticker = d.ticker AND q.date = d.date
WHERE d.date IN ('2026-09-14', '2026-09-15')
  AND d.base_price IS NULL
  AND q.un_close > 0
GROUP BY d.date
ORDER BY d.date;

BEGIN;

UPDATE daily_prices d
SET base_price = (q.un_close - q.un_change)::integer
FROM quote_snapshots q
WHERE q.ticker = d.ticker
  AND q.date = d.date
  AND d.date IN ('2026-09-14', '2026-09-15')
  AND d.base_price IS NULL
  AND q.un_close > 0;

COMMIT;

-- 대조 (선택): 2026-09-14 base_price 는 2026-09-11 close 와 같아야 한다 (권리락 종목 제외).
SELECT count(*) AS mismatch_0914
FROM daily_prices d
JOIN daily_prices p ON p.ticker = d.ticker AND p.date = '2026-09-11'
WHERE d.date = '2026-09-14' AND d.base_price <> p.close;
