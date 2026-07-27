"""
pykrx 종목 일봉 → daily_prices 대량 백필 (idempotent upsert).

용도
  대량 과거 구간 백필 전용. 일일 갱신은 fetch_prices.py (KIS) 소관.
  pykrx 는 D+1 08:00 KST 공표 특성상 당일 EOD 회귀에 부적합하나, 과거 구간
  정합·재적재는 신뢰도가 높아 백필 소스로 유지.

사용
  python backfill_prices.py --backfill YYYY-MM-DD YYYY-MM-DD
  python backfill_prices.py --backfill YYYY-MM-DD YYYY-MM-DD --tickers 005930,000660
    · 주말/공휴일은 pykrx 빈 응답으로 skip
    · --tickers 미지정 시 is_active=true 전종목

규약: fetch_prices.py / backfill_index_prices.py 와 동일 (psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / 종목별 에러 격리).
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime

import psycopg2
from dotenv import load_dotenv
from pykrx import stock as krx

load_dotenv()

# ── 로깅 ──────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"prices_backfill_{datetime.today().strftime('%Y%m%d')}.log"
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

BATCH_SIZE = 200
PYKRX_GAP_SEC = 0.3


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def get_all_active_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true")
    return [r[0] for r in cursor.fetchall()]


UPSERT_SQL = """
    INSERT INTO daily_prices (ticker, date, open, high, low, close, volume)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, date) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
"""


def fetch_and_insert(conn, cursor, ticker: str, start: str, end: str) -> int:
    """
    반환값 규약:
      양수 : 적재 건수 (success)
      0    : 데이터 없음 / 휴장 (skip)
      -1   : 오류 발생 (error)
    """
    try:
        df = krx.get_market_ohlcv(start, end, ticker)
    except Exception as e:
        logger.error("pykrx 호출 실패 %s: %s", ticker, e)
        return -1

    if df is None or df.empty:
        return 0

    rows = []
    for date, row in df.iterrows():
        rows.append(
            (
                ticker,
                date.strftime("%Y-%m-%d"),
                int(row["시가"]),
                int(row["고가"]),
                int(row["저가"]),
                int(row["종가"]),
                int(row["거래량"]),
            )
        )

    if not rows:
        return 0

    try:
        cursor.executemany(UPSERT_SQL, rows)
        conn.commit()
    except Exception as e:
        logger.error("DB 적재 실패 %s: %s", ticker, e)
        conn.rollback()
        return -1

    return len(rows)


def run_backfill(start_str: str, end_str: str, tickers: list[str] | None):
    try:
        datetime.strptime(start_str, "%Y-%m-%d")
        datetime.strptime(end_str, "%Y-%m-%d")
    except ValueError as e:
        logger.error("--backfill 인자 형식 오류 (YYYY-MM-DD): %s", e)
        sys.exit(2)
    if start_str > end_str:
        logger.error(
            "--backfill START(%s) > END(%s) — 범위 오류", start_str, end_str
        )
        sys.exit(2)

    start = start_str.replace("-", "")
    end = end_str.replace("-", "")

    conn = get_connection()
    cursor = conn.cursor()
    if tickers is None:
        tickers = get_all_active_tickers(cursor)
    cursor.close()
    conn.close()

    total = len(tickers)
    logger.info("백필 시작 %s ~ %s — %d개 종목", start_str, end_str, total)

    success = skip = error = 0
    conn = get_connection()
    cursor = conn.cursor()

    for i, ticker in enumerate(tickers, 1):
        if i > 1 and (i - 1) % BATCH_SIZE == 0:
            cursor.close()
            conn.close()
            conn = get_connection()
            cursor = conn.cursor()

        try:
            count = fetch_and_insert(conn, cursor, ticker, start, end)
            time.sleep(PYKRX_GAP_SEC)
            if count > 0:
                success += 1
            elif count == 0:
                skip += 1
            else:
                error += 1
        except Exception as e:
            logger.error("[%s] 처리 실패, 스킵: %s", ticker, e)
            error += 1

        if i % 100 == 0:
            logger.info(
                "진행 %d/%d: 성공=%d, 스킵=%d, 오류=%d",
                i, total, success, skip, error,
            )

    cursor.close()
    conn.close()
    logger.info("백필 완료: 성공=%d, 스킵=%d, 오류=%d", success, skip, error)


def main():
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="pykrx 종목 일봉 대량 백필 → daily_prices upsert. "
                    "일일 갱신은 fetch_prices.py (KIS) 소관."
    )
    parser.add_argument(
        "--backfill",
        nargs=2,
        required=True,
        metavar=("START", "END"),
        help="백필 구간 (YYYY-MM-DD YYYY-MM-DD)",
    )
    parser.add_argument(
        "--tickers",
        default=None,
        help="쉼표 구분 종목 코드 (예: 005930,000660). 미지정 시 is_active 전종목.",
    )
    args = parser.parse_args()

    tks: list[str] | None = None
    if args.tickers:
        tks = [t.strip() for t in args.tickers.split(",") if t.strip()]
        if not tks:
            logger.error("--tickers 파싱 실패")
            sys.exit(2)

    run_backfill(args.backfill[0], args.backfill[1], tks)


if __name__ == "__main__":
    main()
