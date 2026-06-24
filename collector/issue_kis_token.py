"""
KIS 토큰을 발급해 Neon kis_token 단일행 테이블에 저장한다.

GitHub Actions cron(12시간 주기)로 실행한다. web(앱)은 이 행을 read만 한다.
expires_at_ms는 raw 만료(버퍼 미적용)로 저장하고, 버퍼는 web read 쪽에서 적용한다.
"""

import json
import logging
import os
import sys
import time
from datetime import datetime
import psycopg2
import requests
from dotenv import load_dotenv

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

TOKEN_URL = "https://openapi.koreainvestment.com:9443/oauth2/tokenP"


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def request_token(app_key: str, app_secret: str) -> tuple[str, int]:
    """KIS 토큰 발급. 성공 시 (access_token, expires_in_sec) 반환.
    실패·비정상 응답 시 로그 후 exit 1.
    """
    body = {
        "grant_type": "client_credentials",
        "appkey": app_key,
        "appsecret": app_secret,
    }
    try:
        res = requests.post(
            TOKEN_URL,
            data=json.dumps(body),
            headers={"content-type": "application/json"},
            timeout=10,
        )
    except requests.RequestException as e:
        logger.error("토큰 발급 요청 실패: %s", e)
        sys.exit(1)

    if res.status_code != 200:
        body_text = res.text[:200]
        # 1분 1회 발급 제한(EGW 계열)은 본문 코드로 안내됨
        if res.status_code == 403 or "EGW" in body_text:
            logger.error("토큰 발급 rate limit (HTTP %d): %s", res.status_code, body_text)
        else:
            logger.error("토큰 발급 실패 (HTTP %d): %s", res.status_code, body_text)
        sys.exit(1)

    try:
        data = res.json()
    except ValueError as e:
        logger.error("토큰 응답 JSON 파싱 실패: %s", e)
        sys.exit(1)

    token = data.get("access_token")
    expires_in = data.get("expires_in")
    if not token or not expires_in:
        logger.error("토큰 응답 필드 누락 (access_token / expires_in): %s", data)
        sys.exit(1)

    return token, int(expires_in)


def upsert_token(conn, access_token: str, expires_at_ms: int) -> None:
    cursor = conn.cursor()
    sql = """
        INSERT INTO kis_token (id, access_token, expires_at_ms, updated_at)
        VALUES (1, %s, %s, now())
        ON CONFLICT (id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            expires_at_ms = EXCLUDED.expires_at_ms,
            updated_at = now()
    """
    try:
        cursor.execute(sql, (access_token, expires_at_ms))
        conn.commit()
    except Exception as e:
        logger.error("kis_token upsert 실패: %s", e)
        conn.rollback()
        sys.exit(1)
    finally:
        cursor.close()


def main():
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

    conn = get_connection()
    try:
        upsert_token(conn, token, expires_at_ms)
    finally:
        conn.close()

    logger.info("발급 완료: expires_in=%d초 (만료 %s)", expires_in, expires_at_iso)


if __name__ == "__main__":
    main()
