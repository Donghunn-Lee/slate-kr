import logging
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
from pykrx import stock as krx
import time

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"prices_{datetime.today().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def get_all_last_dates(cursor) -> dict[str, str]:
    """DB에 저장된 모든 ticker의 마지막 날짜를 한 번에 반환. 없으면 전체 시작일."""
    cursor.execute("SELECT ticker, MAX(date) FROM daily_prices GROUP BY ticker")
    result = {}
    for ticker, max_date in cursor.fetchall():
        if max_date:
            result[ticker] = (max_date + timedelta(days=1)).strftime("%Y%m%d")
    return result


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
        logger.debug("데이터 없음: %s (%s~%s)", ticker, start, end)
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

    sql = """
        INSERT INTO daily_prices (ticker, date, open, high, low, close, volume)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ticker, date) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
    """
    try:
        cursor.executemany(sql, rows)
        conn.commit()
    except Exception as e:
        logger.error("DB 적재 실패 %s: %s", ticker, e)
        conn.rollback()
        return -1

    return len(rows)


def get_all_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true")
    return [row[0] for row in cursor.fetchall()]


BATCH_SIZE = 200


def run(end: str):
    conn = get_connection()
    cursor = conn.cursor()
    tickers = get_all_tickers(cursor)
    last_dates = get_all_last_dates(cursor)
    cursor.close()
    conn.close()

    total = len(tickers)
    logger.info("총 %d개 종목 적재 시작 (~ %s)", total, end)

    success, skip, error = 0, 0, 0
    conn = get_connection()
    cursor = conn.cursor()

    for i, ticker in enumerate(tickers, 1):
        # 배치 경계: BATCH_SIZE개마다 커넥션 교체
        if i > 1 and (i - 1) % BATCH_SIZE == 0:
            cursor.close()
            conn.close()
            conn = get_connection()
            cursor = conn.cursor()

        try:
            start = last_dates.get(ticker, "19900101")

            if start > end:
                logger.debug(
                    "최신 상태 유지 중: %s (start=%s > end=%s)", ticker, start, end
                )
                skip += 1
            else:
                count = fetch_and_insert(conn, cursor, ticker, start, end)
                time.sleep(0.3)  # KRX 요청 간격

                if count > 0:
                    success += 1
                elif count == 0:
                    skip += 1
                else:  # -1
                    error += 1
        except Exception as e:
            logger.error("처리 실패, 스킵: %s: %s", ticker, e)
            error += 1

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                error,
            )

    cursor.close()
    conn.close()
    logger.info("완료: 성공=%d, 스킵=%d, 오류=%d", success, skip, error)


if __name__ == "__main__":
    end = datetime.today().strftime("%Y%m%d")
    run(end)
