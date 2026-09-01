"""
KIS 휴장·개장일 API 2종 → market_trading_days idempotent upsert.

수집 대상
  KRX          CTCA0903R BASS_DT=today(KST) — 24일치 opnd_yn 을 그대로 저장.
  US·JP·HK·CN CTOS5011R TRAD_DT ∈ (yesterday, today) — 응답에 등장한 국가만
              개장으로 판정, 나머지 4개 시장은 휴장(false)으로 upsert.
              VN 은 저장 대상 아님.

규약
  rt_cd != '0' 또는 HTTP 오류 → 그 날짜는 아무것도 쓰지 않는다.
  응답 부재 = 휴장 추론은 rt_cd == '0' 응답에서만 유효하기 때문.

중복 호출 가드
  대상 (market, trade_date) 행 중 하나라도 fetched_at 이 오늘(KST) 이후이면
  그 API 호출을 skip. --force 로 우회.

에러 격리
  국내·해외 호출은 각각 try/except 로 격리. 하나라도 실패하면 마지막에
  exit 1(성공한 upsert 는 이미 커밋).

규약 정합 (fetch_index_prices.py / fetch_overseas_indices.py 대칭):
  psycopg2 / load_dotenv / logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

from db import get_connection
from kis_token import get_token

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"

DOMESTIC_PATH = "/uapi/domestic-stock/v1/quotations/chk-holiday"
DOMESTIC_TR_ID = "CTCA0903R"

OVERSEAS_PATH = "/uapi/overseas-stock/v1/quotations/countries-holiday"
OVERSEAS_TR_ID = "CTOS5011R"

# CTOS5011R 응답에는 VN·GB 등 다른 국가도 등장할 수 있으나 이 4시장만 저장 대상.
OVERSEAS_MARKETS: tuple[str, ...] = ("US", "JP", "HK", "CN")

KST = timezone(timedelta(hours=9))

# ── 로깅 ──────────────────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"market_calendar_{datetime.today().strftime('%Y%m%d')}.log"
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


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_trading_days (
  market     varchar(8)  NOT NULL,
  trade_date date        NOT NULL,
  is_open    boolean     NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, trade_date)
)
"""


def _ensure_table(cursor) -> None:
    cursor.execute(CREATE_TABLE_SQL)


def _headers(token: str, tr_id: str) -> dict:
    return {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": KIS_APP_KEY or "",
        "appsecret": KIS_APP_SECRET or "",
        "tr_id": tr_id,
        "custtype": "P",
    }


def _today_kst_start() -> datetime:
    now = datetime.now(KST)
    return datetime(now.year, now.month, now.day, tzinfo=KST)


def _already_fetched_today(cursor, markets: tuple[str, ...],
                           trade_dates: tuple[date, ...]) -> bool:
    """대상 (market, trade_date) 조합 중 하나라도 fetched_at 이 오늘(KST) 이후이면 True."""
    cursor.execute(
        """
        SELECT 1
          FROM market_trading_days
         WHERE market = ANY(%s)
           AND trade_date = ANY(%s)
           AND fetched_at >= %s
         LIMIT 1
        """,
        (list(markets), list(trade_dates), _today_kst_start()),
    )
    return cursor.fetchone() is not None


def _upsert_rows(cursor, rows: list[tuple[str, date, bool]]) -> int:
    if not rows:
        return 0
    cursor.executemany(
        """
        INSERT INTO market_trading_days (market, trade_date, is_open)
        VALUES (%s, %s, %s)
        ON CONFLICT (market, trade_date) DO UPDATE
          SET is_open    = EXCLUDED.is_open,
              fetched_at = now()
        """,
        rows,
    )
    return len(rows)


def _parse_bass_dt(s: str) -> date | None:
    if not s or len(s) != 8:
        return None
    try:
        return date(int(s[0:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


# ── KRX ───────────────────────────────────────────────────────────────
def fetch_krx(conn, token: str, today: date, force: bool) -> None:
    """CTCA0903R BASS_DT=today 1회 → KRX 24일치 upsert."""
    cursor = conn.cursor()
    try:
        if not force and _already_fetched_today(cursor, ("KRX",), (today,)):
            logger.info("KRX skip (already fetched today, --force to override)")
            return
    finally:
        cursor.close()

    params = {
        "BASS_DT": today.strftime("%Y%m%d"),
        "CTX_AREA_NK": "",
        "CTX_AREA_FK": "",
    }
    res = requests.get(
        f"{DOMAIN}{DOMESTIC_PATH}",
        headers=_headers(token, DOMESTIC_TR_ID),
        params=params,
        timeout=15,
    )
    if res.status_code != 200:
        raise RuntimeError(f"KRX HTTP {res.status_code}: {res.text[:200]}")
    body = res.json()
    if body.get("rt_cd") != "0":
        raise RuntimeError(
            f"KRX rt_cd={body.get('rt_cd')} msg_cd={body.get('msg_cd')} "
            f"msg1={(body.get('msg1') or '').strip()}"
        )

    output = body.get("output") or []
    rows: list[tuple[str, date, bool]] = []
    for row in output:
        d = _parse_bass_dt(row.get("bass_dt") or "")
        if d is None:
            logger.warning("KRX row bass_dt 파싱 실패: %r", row.get("bass_dt"))
            continue
        is_open = (row.get("opnd_yn") == "Y")
        rows.append(("KRX", d, is_open))

    cursor = conn.cursor()
    try:
        n = _upsert_rows(cursor, rows)
        conn.commit()
    finally:
        cursor.close()
    logger.info("KRX response=%d rows, upsert=%d", len(output), n)


# ── 해외 ──────────────────────────────────────────────────────────────
def fetch_overseas_for_date(conn, token: str, target: date, force: bool) -> None:
    """CTOS5011R TRAD_DT=target 1회 → US·JP·HK·CN 4시장 upsert."""
    cursor = conn.cursor()
    try:
        if not force and _already_fetched_today(cursor, OVERSEAS_MARKETS, (target,)):
            logger.info("overseas %s skip (already fetched today, --force to override)",
                        target)
            return
    finally:
        cursor.close()

    params = {
        "TRAD_DT": target.strftime("%Y%m%d"),
        "CTX_AREA_NK": "",
        "CTX_AREA_FK": "",
    }
    res = requests.get(
        f"{DOMAIN}{OVERSEAS_PATH}",
        headers=_headers(token, OVERSEAS_TR_ID),
        params=params,
        timeout=15,
    )
    if res.status_code != 200:
        raise RuntimeError(
            f"overseas {target} HTTP {res.status_code}: {res.text[:200]}"
        )
    body = res.json()
    if body.get("rt_cd") != "0":
        raise RuntimeError(
            f"overseas {target} rt_cd={body.get('rt_cd')} "
            f"msg_cd={body.get('msg_cd')} msg1={(body.get('msg1') or '').strip()}"
        )

    output = body.get("output") or []
    present: set[str] = set()
    for row in output:
        code = row.get("natn_eng_abrv_cd")
        if isinstance(code, str) and code:
            present.add(code)

    rows: list[tuple[str, date, bool]] = [
        (m, target, m in present) for m in OVERSEAS_MARKETS
    ]

    cursor = conn.cursor()
    try:
        n = _upsert_rows(cursor, rows)
        conn.commit()
    finally:
        cursor.close()
    logger.info(
        "overseas %s response=%d rows, present=%s, upsert=%d",
        target, len(output), sorted(present), n,
    )


# ── main ──────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="KIS 휴장·개장 캘린더 적재")
    parser.add_argument("--force", action="store_true",
                        help="중복 호출 가드 우회")
    args = parser.parse_args()

    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정")
        sys.exit(1)

    now_kst = datetime.now(KST)
    today = now_kst.date()
    yesterday = today - timedelta(days=1)
    logger.info("start · now(KST)=%s · today=%s · yesterday=%s · force=%s",
                now_kst.strftime("%Y-%m-%d %H:%M:%S"), today, yesterday, args.force)

    conn = get_connection()
    failures: list[str] = []
    try:
        cursor = conn.cursor()
        try:
            _ensure_table(cursor)
            conn.commit()
        finally:
            cursor.close()

        token = get_token(conn)

        try:
            fetch_krx(conn, token, today, args.force)
        except Exception as e:
            logger.error("KRX 실패: %s", e)
            failures.append(f"KRX: {e}")

        for d in (yesterday, today):
            try:
                fetch_overseas_for_date(conn, token, d, args.force)
            except Exception as e:
                logger.error("overseas %s 실패: %s", d, e)
                failures.append(f"overseas {d}: {e}")
    finally:
        conn.close()

    if failures:
        logger.error("완료 (실패 %d건): %s", len(failures), "; ".join(failures))
        sys.exit(1)
    logger.info("완료 (전 호출 성공)")


if __name__ == "__main__":
    main()
