"""
KIS 토큰 단일 취득 지점.

우선순위: DB kis_token 재사용 → 무효·부재·강제 시 발급 + DB write-back.
유효성: 잔여 TTL < REISSUE_BUFFER_MS 이면 재발급 (기본 1h).

발급·저장 로직은 fetch_index_prices 폴백 + issue_kis_token 을 이관해 단일화한
것이라, KIS API 호출부(request_token) 와 DB write(upsert_token) 는 여기가 참조
구현이다. issue_kis_token.py 도 이 헬퍼를 재사용한다.

환경변수
  KIS_APP_KEY / KIS_APP_SECRET  필수
  KIS_TOKEN_FORCE_ISSUE=1       DB 재사용 skip 후 강제 발급 (수동 복구·테스트용)
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time

import requests

DOMAIN = "https://openapi.koreainvestment.com:9443"
TOKEN_PATH = "/oauth2/tokenP"
# 잔여 TTL 이 이보다 짧으면 재발급.
REISSUE_BUFFER_MS = 60 * 60 * 1000  # 1h

logger = logging.getLogger(__name__)


def _read_valid_token(cursor) -> str | None:
    """kis_token 최신행 read → 유효 시 토큰, 아니면 None."""
    cursor.execute(
        "SELECT access_token, expires_at_ms FROM kis_token "
        "ORDER BY updated_at DESC LIMIT 1"
    )
    row = cursor.fetchone()
    if row is None:
        logger.info("kis_token 비어있음")
        return None
    token, expires_at_ms = row
    if not token or not expires_at_ms:
        logger.info("kis_token 필드 누락")
        return None
    remain_ms = int(expires_at_ms) - int(time.time() * 1000)
    if remain_ms < REISSUE_BUFFER_MS:
        logger.info("kis_token 잔여 TTL 부족 (~%.1f분)", remain_ms / 1000 / 60)
        return None
    logger.info("kis_token DB 재사용 (잔여 ~%.1f시간)", remain_ms / 3600 / 1000)
    return token


def request_token(app_key: str, app_secret: str) -> tuple[str, int]:
    """KIS 토큰 발급 API 호출. (access_token, expires_in_sec). 실패 시 exit 1."""
    try:
        res = requests.post(
            f"{DOMAIN}{TOKEN_PATH}",
            data=json.dumps(
                {
                    "grant_type": "client_credentials",
                    "appkey": app_key,
                    "appsecret": app_secret,
                }
            ),
            headers={"content-type": "application/json"},
            timeout=10,
        )
    except requests.RequestException as e:
        logger.error("KIS 토큰 요청 실패: %s", e)
        sys.exit(1)

    if res.status_code != 200:
        body_text = res.text[:200]
        # 1분 1회 발급 제한(EGW 계열)은 본문 코드로 안내됨.
        if res.status_code == 403 or "EGW" in body_text:
            logger.error("KIS 토큰 rate limit (HTTP %d): %s", res.status_code, body_text)
        else:
            logger.error("KIS 토큰 발급 실패 (HTTP %d): %s", res.status_code, body_text)
        sys.exit(1)

    try:
        data = res.json()
    except ValueError:
        logger.error("KIS 토큰 JSON 파싱 실패: %s", res.text[:200])
        sys.exit(1)

    tok = data.get("access_token")
    expires_in = data.get("expires_in")
    if not tok or not expires_in:
        logger.error("KIS 토큰 응답 필드 누락: %s", data)
        sys.exit(1)
    return tok, int(expires_in)


def upsert_token(conn, access_token: str, expires_at_ms: int) -> None:
    """kis_token 단일행(id=1) upsert. 실패 시 rollback + raise."""
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO kis_token (id, access_token, expires_at_ms, updated_at)
            VALUES (1, %s, %s, now())
            ON CONFLICT (id) DO UPDATE SET
              access_token  = EXCLUDED.access_token,
              expires_at_ms = EXCLUDED.expires_at_ms,
              updated_at    = now()
            """,
            (access_token, expires_at_ms),
        )
        conn.commit()
    except Exception as e:
        logger.error("kis_token upsert 실패: %s", e)
        conn.rollback()
        raise
    finally:
        cur.close()


def get_token(conn) -> str:
    """유효 토큰 반환. DB 재사용 우선, 무효/부재/강제 시 발급 + write-back."""
    app_key = os.getenv("KIS_APP_KEY")
    app_secret = os.getenv("KIS_APP_SECRET")
    if not app_key or not app_secret:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)

    force = os.getenv("KIS_TOKEN_FORCE_ISSUE") == "1"
    if force:
        logger.info("KIS_TOKEN_FORCE_ISSUE=1 — DB 재사용 skip")
    else:
        cur = conn.cursor()
        try:
            tok = _read_valid_token(cur)
        finally:
            cur.close()
        if tok is not None:
            return tok

    tok, expires_in = request_token(app_key, app_secret)
    expires_at_ms = int(time.time() * 1000) + expires_in * 1000
    upsert_token(conn, tok, expires_at_ms)
    logger.info(
        "kis_token 발급 완료 (expires_in=%ds) → DB write-back", expires_in
    )
    return tok
