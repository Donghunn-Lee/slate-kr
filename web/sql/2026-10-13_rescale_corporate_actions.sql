-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- 기업행위 16종목의 2026-09-14 ~ event 직전 거래일 행을 KIS 수정주가 축으로 rescale.
-- 템플릿: rescale_corporate_action.sql. ≤ 2026-09-11 행은 backfill_prices_kis.py --tickers 로
--   재적재를 마쳤다 (2026-10-13). factor = 재적재 후 9/11 close ÷ 재적재 전 9/11 close.
-- 절차: 블록마다 ① 검증 SELECT 가 블록 머리의 기대값(행 수 · 구간 · close 범위)과 같은지 확인 —
--         다르면 그 블록은 실행하지 않고 보고
--       ② 같으면 BEGIN ~ COMMIT. UPDATE 카운트가 기대 행 수와 다르면 COMMIT 대신 ROLLBACK
-- volume ÷factor 는 구간에 실거래 행(volume > 0)이 있는 블록만 넣었다 — 정지 구간은 0 이라 무관.
-- factor 가 정수면 소수점을 붙여 쓴다 — bigint / integer 는 정수 나눗셈이 된다.

-- ══ 017650 대림제지 · event 2026-10-13 ══
-- 구간 2026-09-14 ~ 2026-10-12 · 17행 · factor 0.2 (9/11 close 10850 → 2170)
-- volume ÷factor 포함 — 구간 실거래 4행
-- 검증 기대: rows_to_rescale 17 · 2026-09-14 ~ 2026-10-12 · close 10800 ~ 10880
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '017650'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.2),
    high       = ROUND(high       * 0.2),
    low        = ROUND(low        * 0.2),
    close      = ROUND(close      * 0.2),
    base_price = ROUND(base_price * 0.2),
    volume     = ROUND(volume     / 0.2)
WHERE ticker = '017650'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';
-- 예상 UPDATE 카운트: 17

COMMIT;

-- ══ 032080 아즈텍WB · event 2026-10-13 ══
-- 구간 2026-09-14 ~ 2026-10-12 · 17행 · factor 2.0 (9/11 close 1037 → 2074)
-- volume ÷factor 포함 — 구간 실거래 1행
-- 검증 기대: rows_to_rescale 17 · 2026-09-14 ~ 2026-10-12 · close 1010 ~ 1030
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '032080'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 2.0),
    high       = ROUND(high       * 2.0),
    low        = ROUND(low        * 2.0),
    close      = ROUND(close      * 2.0),
    base_price = ROUND(base_price * 2.0),
    volume     = ROUND(volume     / 2.0)
WHERE ticker = '032080'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';
-- 예상 UPDATE 카운트: 17

COMMIT;

-- ══ 038060 루멘스바이오스 · event 2026-10-13 ══
-- 구간 2026-09-14 ~ 2026-10-12 · 17행 · factor 2.0 (9/11 close 778 → 1556)
-- volume ÷factor 포함 — 구간 실거래 1행
-- 검증 기대: rows_to_rescale 17 · 2026-09-14 ~ 2026-10-12 · close 689 ~ 690
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '038060'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 2.0),
    high       = ROUND(high       * 2.0),
    low        = ROUND(low        * 2.0),
    close      = ROUND(close      * 2.0),
    base_price = ROUND(base_price * 2.0),
    volume     = ROUND(volume     / 2.0)
WHERE ticker = '038060'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';
-- 예상 UPDATE 카운트: 17

COMMIT;

-- ══ 303360 프로티아 · event 2026-10-13 ══
-- 구간 2026-09-14 ~ 2026-10-12 · 17행 · factor 0.666857 (9/11 close 5250 → 3501)
-- volume ÷factor 포함 — 구간 실거래 17행
-- 검증 기대: rows_to_rescale 17 · 2026-09-14 ~ 2026-10-12 · close 5170 ~ 6100
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '303360'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.666857),
    high       = ROUND(high       * 0.666857),
    low        = ROUND(low        * 0.666857),
    close      = ROUND(close      * 0.666857),
    base_price = ROUND(base_price * 0.666857),
    volume     = ROUND(volume     / 0.666857)
WHERE ticker = '303360'
  AND date >= '2026-09-14'
  AND date < '2026-10-13';
-- 예상 UPDATE 카운트: 17

COMMIT;

-- ══ 009730 이렘 · event 2026-10-12 ══
-- 구간 2026-09-14 ~ 2026-10-08 · 16행 · factor 0.817063 (9/11 close 2520 → 2059)
-- volume ÷factor 포함 — 구간 실거래 16행
-- 검증 기대: rows_to_rescale 16 · 2026-09-14 ~ 2026-10-08 · close 1962 ~ 2165
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '009730'
  AND date >= '2026-09-14'
  AND date < '2026-10-12';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 0.817063),
    high       = ROUND(high       * 0.817063),
    low        = ROUND(low        * 0.817063),
    close      = ROUND(close      * 0.817063),
    base_price = ROUND(base_price * 0.817063),
    volume     = ROUND(volume     / 0.817063)
WHERE ticker = '009730'
  AND date >= '2026-09-14'
  AND date < '2026-10-12';
-- 예상 UPDATE 카운트: 16

COMMIT;

-- ══ 014160 대영포장 · event 2026-10-12 ══
-- 구간 2026-09-14 ~ 2026-10-08 · 16행 · factor 5.0 (9/11 close 671 → 3355)
-- volume ÷factor 포함 — 구간 실거래 3행
-- 검증 기대: rows_to_rescale 16 · 2026-09-14 ~ 2026-10-08 · close 640 ~ 657
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '014160'
  AND date >= '2026-09-14'
  AND date < '2026-10-12';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0),
    volume     = ROUND(volume     / 5.0)
WHERE ticker = '014160'
  AND date >= '2026-09-14'
  AND date < '2026-10-12';
-- 예상 UPDATE 카운트: 16

COMMIT;

-- ══ 203400 에이비온 · event 2026-10-08 ══
-- 구간 2026-09-14 ~ 2026-10-07 · 15행 · factor 5.0 (9/11 close 676 → 3380)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 15 · 2026-09-14 ~ 2026-10-07 · close 676 ~ 676
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '203400'
  AND date >= '2026-09-14'
  AND date < '2026-10-08';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '203400'
  AND date >= '2026-09-14'
  AND date < '2026-10-08';
-- 예상 UPDATE 카운트: 15

COMMIT;

-- ══ 050110 캠시스 · event 2026-10-07 ══
-- 구간 2026-09-14 ~ 2026-10-06 · 14행 · factor 5.004634 (9/11 close 1079 → 5400)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 14 · 2026-09-14 ~ 2026-10-06 · close 1079 ~ 1079
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '050110'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.004634),
    high       = ROUND(high       * 5.004634),
    low        = ROUND(low        * 5.004634),
    close      = ROUND(close      * 5.004634),
    base_price = ROUND(base_price * 5.004634)
WHERE ticker = '050110'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';
-- 예상 UPDATE 카운트: 14

COMMIT;

-- ══ 056090 시지메드텍 · event 2026-10-07 ══
-- 구간 2026-09-14 ~ 2026-10-06 · 14행 · factor 5.0 (9/11 close 1190 → 5950)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 14 · 2026-09-14 ~ 2026-10-06 · close 1190 ~ 1190
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '056090'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '056090'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';
-- 예상 UPDATE 카운트: 14

COMMIT;

-- ══ 131400 이브이첨단소재 · event 2026-10-07 ══
-- 구간 2026-09-14 ~ 2026-10-06 · 14행 · factor 11.096606 (9/11 close 766 → 8500)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 14 · 2026-09-14 ~ 2026-10-06 · close 766 ~ 766
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '131400'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 11.096606),
    high       = ROUND(high       * 11.096606),
    low        = ROUND(low        * 11.096606),
    close      = ROUND(close      * 11.096606),
    base_price = ROUND(base_price * 11.096606)
WHERE ticker = '131400'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';
-- 예상 UPDATE 카운트: 14

COMMIT;

-- ══ 340440 세림B&G · event 2026-10-07 ══
-- 구간 2026-09-14 ~ 2026-10-06 · 14행 · factor 5.0 (9/11 close 756 → 3780)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 14 · 2026-09-14 ~ 2026-10-06 · close 756 ~ 756
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '340440'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '340440'
  AND date >= '2026-09-14'
  AND date < '2026-10-07';
-- 예상 UPDATE 카운트: 14

COMMIT;

-- ══ 900120 씨엑스아이 · event 2026-10-06 ══
-- 구간 2026-09-14 ~ 2026-10-02 · 13행 · factor 5.0 (9/11 close 1040 → 5200)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 13 · 2026-09-14 ~ 2026-10-02 · close 1040 ~ 1040
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '900120'
  AND date >= '2026-09-14'
  AND date < '2026-10-06';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '900120'
  AND date >= '2026-09-14'
  AND date < '2026-10-06';
-- 예상 UPDATE 카운트: 13

COMMIT;

-- ══ 004920 씨아이테크 · event 2026-10-02 ══
-- 구간 2026-09-14 ~ 2026-10-01 · 12행 · factor 10.0 (9/11 close 907 → 9070)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 12 · 2026-09-14 ~ 2026-10-01 · close 907 ~ 907
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '004920'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 10.0),
    high       = ROUND(high       * 10.0),
    low        = ROUND(low        * 10.0),
    close      = ROUND(close      * 10.0),
    base_price = ROUND(base_price * 10.0)
WHERE ticker = '004920'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';
-- 예상 UPDATE 카운트: 12

COMMIT;

-- ══ 051980 중앙첨단소재 · event 2026-10-02 ══
-- 구간 2026-09-14 ~ 2026-10-01 · 12행 · factor 10.0 (9/11 close 1035 → 10350)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 12 · 2026-09-14 ~ 2026-10-01 · close 1035 ~ 1035
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '051980'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 10.0),
    high       = ROUND(high       * 10.0),
    low        = ROUND(low        * 10.0),
    close      = ROUND(close      * 10.0),
    base_price = ROUND(base_price * 10.0)
WHERE ticker = '051980'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';
-- 예상 UPDATE 카운트: 12

COMMIT;

-- ══ 084680 이월드 · event 2026-10-02 ══
-- 구간 2026-09-14 ~ 2026-10-01 · 12행 · factor 5.0 (9/11 close 532 → 2660)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 12 · 2026-09-14 ~ 2026-10-01 · close 532 ~ 532
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '084680'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '084680'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';
-- 예상 UPDATE 카운트: 12

COMMIT;

-- ══ 469750 아이비젼웍스 · event 2026-10-02 ══
-- 구간 2026-09-14 ~ 2026-10-01 · 12행 · factor 5.0 (9/11 close 991 → 4955)
-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)
-- 검증 기대: rows_to_rescale 12 · 2026-09-14 ~ 2026-10-01 · close 991 ~ 991
SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,
       min(close) AS min_close, max(close) AS max_close
FROM daily_prices
WHERE ticker = '469750'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';

BEGIN;

UPDATE daily_prices
SET open       = ROUND(open       * 5.0),
    high       = ROUND(high       * 5.0),
    low        = ROUND(low        * 5.0),
    close      = ROUND(close      * 5.0),
    base_price = ROUND(base_price * 5.0)
WHERE ticker = '469750'
  AND date >= '2026-09-14'
  AND date < '2026-10-02';
-- 예상 UPDATE 카운트: 12

COMMIT;
