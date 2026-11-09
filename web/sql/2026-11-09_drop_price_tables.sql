-- 2026-11-09 로컬에서 직결 URL 로 1회 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- 가격 계열은 web/src/lib/demo/ 생성기가 만든다. 아래 7개 테이블과 stocks.listed_at 은 web · collector ·
-- workflows 어디서도 읽지 않고, 의존 객체(뷰 · FK · 트리거 · 함수)도 없다.
-- 실행 전 전체 덤프: 저장소 상위 폴더의 slate-kr-backup/slatekr_2026-11-09.dump (pg_dump custom format).
-- CASCADE 는 쓰지 않는다 — 의존 객체가 있으면 에러로 트랜잭션 전체가 롤백된다.

BEGIN;
DROP TABLE daily_prices, quote_snapshots, index_daily_prices,
  domestic_index_intraday, overseas_index_intraday, market_trading_days, kis_token;
ALTER TABLE stocks DROP COLUMN listed_at;
COMMIT;
