-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- 기업행위 7종목의 2026-09-14 ~ event 직전 거래일 행을 KIS 수정주가 축으로 rescale.
-- 템플릿: rescale_corporate_action.sql. ≤ 2026-09-11 행은 backfill_prices_kis.py --tickers 로
--   재적재를 마쳤다 (2026-10-21). factor = 재적재 후 9/11 close ÷ 재적재 전 9/11 close.
-- 사건 유형은 DART 공시로 확인했고, 7건 모두 KIS 조정(kis_adj=1)이다.
-- 절차: 블록마다 ① 검증 SELECT 가 블록 머리의 기대값(행 수 · 구간 · close 범위)과 같은지 확인 —
--         다르면 그 블록은 실행하지 않고 보고
--       ② 같으면 BEGIN ~ COMMIT. UPDATE 카운트가 기대 행 수와 다르면 COMMIT 대신 ROLLBACK
-- volume ÷factor 는 구간에 실거래 행(volume > 0)이 있는 블록만 넣었다 — 정지 구간은 0 이라 무관.
-- factor 가 정수면 소수점을 붙여 쓴다 — bigint / integer 는 정수 나눗셈이 된다.

-- ══ 099520 DGI · event 2026-10-21 ══
-- 사건: 2021-03-26 부터 거래정지 — 정지 중 회생계획 감자·제3자배정 유상증자를 거쳐 2026-10-21 상장유지 결정으로 재개, 기준가 1105
-- 구간 2026-09-14 ~ 2026-10-20 · 23행 · factor 0.860592 (9/11 close 1284 → 1105)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 23 · 2026-09-14 ~ 2026-10-20 · close 1284 ~ 1284
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '099520'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.860592),
    high       = ROUND(high       * 0.860592),
    low        = ROUND(low        * 0.860592),
    close      = ROUND(close      * 0.860592),
    base_price = ROUND(base_price * 0.860592)
WHERE ticker = '099520'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';
-- 예상 UPDATE 카운트: 23

COMMIT;

-- ══ 117670 알파칩스 · event 2026-10-21 ══
-- 사건: 무상증자 1주당 1주, 2026-10-21 권리락
-- 구간 2026-09-14 ~ 2026-10-20 · 23행 · factor 0.5 (9/11 close 13580 → 6790)
-- volume ÷factor 포함 — 구간 실거래 23행
-- 검증 기대: rows_to_rescale 23 · 2026-09-14 ~ 2026-10-20 · close 10260 ~ 14440
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '117670'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.5),
    high       = ROUND(high       * 0.5),
    low        = ROUND(low        * 0.5),
    close      = ROUND(close      * 0.5),
    base_price = ROUND(base_price * 0.5),
    volume     = ROUND(volume     / 0.5)
WHERE ticker = '117670'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';
-- 예상 UPDATE 카운트: 23

COMMIT;

-- ══ 254120 자비스 · event 2026-10-21 ══
-- 사건: 주식병합 5:1, 2026-10-21 변경상장
-- 구간 2026-09-14 ~ 2026-10-20 · 23행 · factor 5.0 (9/11 close 1031 → 5155)
-- volume ÷factor 포함 — 구간 실거래 7행
-- 검증 기대: rows_to_rescale 23 · 2026-09-14 ~ 2026-10-20 · close 905 ~ 1029
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '254120'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0),
    volume     = ROUND(volume     / 5.0)
WHERE ticker = '254120'
  AND date >= '2026-09-14'
  AND date < '2026-10-21';
-- 예상 UPDATE 카운트: 23

COMMIT;

-- ══ 009140 케이아이이 · event 2026-10-20 ══
-- 사건: 무상증자 1주당 1주, 2026-10-20 권리락
-- 구간 2026-09-14 ~ 2026-10-19 · 22행 · factor 0.5 (9/11 close 22350 → 11175)
-- volume ÷factor 포함 — 구간 실거래 22행
-- 검증 기대: rows_to_rescale 22 · 2026-09-14 ~ 2026-10-19 · close 19700 ~ 23950
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '009140'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.5),
    high       = ROUND(high       * 0.5),
    low        = ROUND(low        * 0.5),
    close      = ROUND(close      * 0.5),
    base_price = ROUND(base_price * 0.5),
    volume     = ROUND(volume     / 0.5)
WHERE ticker = '009140'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';
-- 예상 UPDATE 카운트: 22

COMMIT;

-- ══ 057540 옴니시스템 · event 2026-10-20 ══
-- 사건: 주식병합 5:1, 2026-10-20 변경상장
-- 구간 2026-09-14 ~ 2026-10-19 · 22행 · factor 5.0 (9/11 close 593 → 2965)
-- volume ÷factor 포함 — 구간 실거래 7행
-- 검증 기대: rows_to_rescale 22 · 2026-09-14 ~ 2026-10-19 · close 575 ~ 604
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '057540'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0),
    volume     = ROUND(volume     / 5.0)
WHERE ticker = '057540'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';
-- 예상 UPDATE 카운트: 22

COMMIT;

-- ══ 093240 형지엘리트 · event 2026-10-20 ══
-- 사건: 주식병합 5:1, 2026-10-20 변경상장
-- 구간 2026-09-14 ~ 2026-10-19 · 22행 · factor 5.0 (9/11 close 342 → 1710)
-- volume ÷factor 포함 — 구간 실거래 7행
-- 검증 기대: rows_to_rescale 22 · 2026-09-14 ~ 2026-10-19 · close 296 ~ 323
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '093240'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0),
    volume     = ROUND(volume     / 5.0)
WHERE ticker = '093240'
  AND date >= '2026-09-14'
  AND date < '2026-10-20';
-- 예상 UPDATE 카운트: 22

COMMIT;

-- ══ 023150 MH에탄올 · event 2026-10-19 ══
-- 사건: 무상증자 1주당 1주, 2026-10-19 권리락
-- 구간 2026-09-14 ~ 2026-10-16 · 21행 · factor 0.500483 (9/11 close 4140 → 2072)
-- factor 가 0.5 와 다르다 — 9/11 KIS 수정 종가가 4140 × 0.5 = 2070 이 아니라 2072 라서. 규약대로 9/11 비율을 쓴다
-- volume ÷factor 포함 — 구간 실거래 21행
-- 검증 기대: rows_to_rescale 21 · 2026-09-14 ~ 2026-10-16 · close 3960 ~ 4660
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '023150'
  AND date >= '2026-09-14'
  AND date < '2026-10-19';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.500483),
    high       = ROUND(high       * 0.500483),
    low        = ROUND(low        * 0.500483),
    close      = ROUND(close      * 0.500483),
    base_price = ROUND(base_price * 0.500483),
    volume     = ROUND(volume     / 0.500483)
WHERE ticker = '023150'
  AND date >= '2026-09-14'
  AND date < '2026-10-19';
-- 예상 UPDATE 카운트: 21

COMMIT;
