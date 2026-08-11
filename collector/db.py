"""Neon PostgreSQL 커넥션 헬퍼. 모든 fetch/backfill/verify 스크립트가 공유.

hang 방어 (#107 국내 EOD 누락 대응)
  connect_timeout=10          TCP 핸드셰이크·인증 상한
  statement_timeout=60000ms   서버측 문(statement) 실행 상한 —
                              Neon idle disconnect 후 무한 대기 방지.
                              분기점: 이 상한을 넘어야 하는 statement 는
                              backfill 계열에 국한, 그 경우 스크립트 내에서
                              세션 재설정하거나 상한을 조정한다.

idle-drop 보험 (#108 fetch_financials SSL closed 대응)
  keepalives_idle=30          30s 무접촉 시 첫 keepalive 프로브 발송
  keepalives_interval=10      실패 시 10s 간격 재시도
  keepalives_count=3          3회 실패 후 소켓 절단으로 확정
  → 5분 idle 로 절단되던 skip-heavy 구간에서 서버·NAT 측 절단 이전에
    keepalive 로 활성 신호 유지. 재연결 재시도는 fetch_financials 본체 소관.

주의: Neon pooler 는 startup options 로 statement_timeout 지정을 거부
(unsupported startup parameter) — post-connect SET SESSION 으로 우회.
"""

from __future__ import annotations

import os

import psycopg2

CONNECT_TIMEOUT_SEC = 10
STATEMENT_TIMEOUT_MS = 60_000


def get_connection():
    conn = psycopg2.connect(
        os.getenv("DATABASE_URL"),
        connect_timeout=CONNECT_TIMEOUT_SEC,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
    )
    with conn.cursor() as cur:
        cur.execute(f"SET SESSION statement_timeout = {STATEMENT_TIMEOUT_MS}")
    conn.commit()
    return conn
