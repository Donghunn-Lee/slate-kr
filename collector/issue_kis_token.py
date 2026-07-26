"""
KIS 토큰을 발급해 Neon kis_token 단일행 테이블에 저장한다.

GitHub Actions cron(12시간 주기)로 실행한다. web(앱)은 이 행을 read만 한다.
expires_at_ms는 raw 만료(버퍼 미적용)로 저장하고, 버퍼는 web read 쪽에서 적용한다.

발급·저장 로직은 kis_token.request_token / kis_token.upsert_token 재사용.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

from kis_token import request_token, upsert_token

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"kis_token_{datetime.today().strftime('%Y%m%d')}.log"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def main() -> None:
    app_key = os.getenv("KIS_APP_KEY")
    app_secret = os.getenv("KIS_APP_SECRET")
    if not app_key or not app_secret:
        logger.error("KIS_APP_KEY 또는 KIS_APP_SECRET 미설정")
        sys.exit(1)

    logger.info("KIS 토큰 발급 시작")
    token, expires_in = request_token(app_key, app_secret)

    expires_at_ms = int(time.time() * 1000) + expires_in * 1000
    expires_at_iso = datetime.fromtimestamp(expires_at_ms / 1000).isoformat(
        timespec="seconds"
    )

    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    try:
        upsert_token(conn, token, expires_at_ms)
    finally:
        conn.close()

    logger.info("발급 완료: expires_in=%d초 (만료 %s)", expires_in, expires_at_iso)


if __name__ == "__main__":
    main()
