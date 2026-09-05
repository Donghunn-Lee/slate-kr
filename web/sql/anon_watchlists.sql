-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.

CREATE TABLE IF NOT EXISTS anon_watchlists (
  anon_id    uuid        PRIMARY KEY,
  snapshot   jsonb       NOT NULL,
  version    integer     NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
