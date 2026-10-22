-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
--
-- collector/rescale_corp_actions.py 가 적용한 기업행위 rescale 원장. ≤ 2026-09-11 재적재 · 구간
-- UPDATE 와 같은 트랜잭션에서 1행 INSERT 하므로 행이 있으면 그 사건은 적용된 것이다.
-- (ticker, event_date) PK 가 같은 사건의 이중 적용을 막는다. sql 은 web/sql/<날짜>_rescale_<ticker>.sql
-- 로 옮겨 커밋할 블록 텍스트 그대로. run_id 는 GitHub Actions run id — 로컬 실행이면 NULL.

-- ── 검증 SELECT (기대: NULL — 테이블 없음) ──
SELECT to_regclass('public.corp_action_rescales') AS existing;

CREATE TABLE IF NOT EXISTS corp_action_rescales (
  ticker       varchar(10)   NOT NULL,
  event_date   date          NOT NULL,
  factor       numeric(12,6) NOT NULL,
  kis_adj      text          NOT NULL,
  rows_updated integer       NOT NULL,
  sql          text          NOT NULL,
  applied_at   timestamptz   NOT NULL DEFAULT now(),
  run_id       text,
  PRIMARY KEY (ticker, event_date)
);
