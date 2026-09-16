"""
KIS 다종목 시세(FHKST11300006) 호출 + 20:05 게이트 공용 헬퍼.

fetch_quote_snapshots.py(UN/NX 스냅샷) 와 fetch_daily_close.py(J 일봉) 가 공유한다.
두 job 모두 KRX 애프터마켓이 끝난 20:00 이후 응답만 의미가 있어 게이트를 같이 둔다.
로깅·dotenv 설정은 호출 스크립트 소관 — 이 모듈은 import 부작용을 두지 않는다.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime

import requests

from verify_daily_freshness import is_trading_day

DOMAIN = "https://openapi.koreainvestment.com:9443"
MULTI_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice"
TR_MULTI = "FHKST11300006"

CHUNK_SIZE = 30              # KIS 공식 상한
CALL_GAP_SEC = 0.15
GATE_HOUR = 20
GATE_MIN = 5

logger = logging.getLogger(__name__)


# ── 게이트 (pure function — 테스트 시 mock now / calendar 주입) ──────
def is_gate_open(now_kst: datetime,
                 calendar: dict[date, bool] | None = None) -> tuple[bool, str]:
    """(open, reason). open=False 면 reason 메시지 반환."""
    today = now_kst.date()
    if not is_trading_day(today, calendar):
        return False, f"non-trading day ({today.isoformat()})"
    if now_kst.hour < GATE_HOUR or (
        now_kst.hour == GATE_HOUR and now_kst.minute < GATE_MIN
    ):
        return False, (
            f"before {GATE_HOUR:02d}:{GATE_MIN:02d} KST "
            f"(now={now_kst.strftime('%H:%M')})"
        )
    return True, ""


# ── KIS 다종목 콜 ────────────────────────────────────────────────────
def kis_multi(token: str, tickers: list[str], div: str) -> dict | None:
    """FHKST11300006 다종목 조회. output list 를 dict[iscd→row] 로 반환. 실패시 None.
    응답 순서 무관 — inter_shrn_iscd 로 매핑(위치 의존 금지)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": os.getenv("KIS_APP_KEY"),
        "appsecret": os.getenv("KIS_APP_SECRET"),
        "tr_id": TR_MULTI,
        "custtype": "P",
    }
    params: dict[str, str] = {}
    for idx, t in enumerate(tickers, start=1):
        params[f"FID_COND_MRKT_DIV_CODE_{idx}"] = div
        params[f"FID_INPUT_ISCD_{idx}"] = t
    try:
        r = requests.get(
            f"{DOMAIN}{MULTI_PATH}", headers=headers, params=params, timeout=15
        )
    except requests.RequestException as e:
        logger.error("KIS multi 호출 실패 div=%s size=%d: %s", div, len(tickers), e)
        return None
    finally:
        time.sleep(CALL_GAP_SEC)
    if r.status_code != 200:
        logger.error(
            "KIS multi HTTP %d div=%s size=%d: %s",
            r.status_code, div, len(tickers), r.text[:200],
        )
        return None
    try:
        body = r.json()
    except ValueError:
        logger.error("KIS multi JSON 파싱 실패 div=%s size=%d", div, len(tickers))
        return None
    if body.get("rt_cd") != "0":
        logger.error(
            "KIS multi rt_cd=%s div=%s size=%d: %s",
            body.get("rt_cd"), div, len(tickers),
            str(body.get("msg1", ""))[:120],
        )
        return None
    output = body.get("output")
    if not isinstance(output, list):
        logger.error("KIS multi output 비-list div=%s size=%d", div, len(tickers))
        return None
    rows: dict[str, dict] = {}
    for row in output:
        if isinstance(row, dict):
            iscd = row.get("inter_shrn_iscd")
            if isinstance(iscd, str) and iscd:
                rows[iscd] = row
    return rows
