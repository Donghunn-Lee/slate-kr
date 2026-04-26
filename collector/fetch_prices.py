import logging
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import mysql.connector
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

# ── DB 연결 ────────────────────────────────────────────────
db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cursor = db.cursor()


def get_last_date(ticker: str) -> str:
    """DB에 저장된 마지막 날짜 반환. 없으면 전체 시작일."""
    cursor.execute("SELECT MAX(date) FROM daily_prices WHERE ticker = %s", (ticker,))
    row = cursor.fetchone()
    if row and row[0]:
        next_day = (row[0] + timedelta(days=1)).strftime("%Y%m%d")
        return next_day
    return "19900101"


def fetch_and_insert(ticker: str, start: str, end: str) -> int:
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
        ON DUPLICATE KEY UPDATE
            open=VALUES(open), high=VALUES(high), low=VALUES(low),
            close=VALUES(close), volume=VALUES(volume)
    """
    try:
        cursor.executemany(sql, rows)
        db.commit()
    except Exception as e:
        logger.error("DB 적재 실패 %s: %s", ticker, e)
        db.rollback()
        return -1

    return len(rows)


def get_all_tickers() -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = 1")
    return [row[0] for row in cursor.fetchall()]


def run(end: str):
    tickers = get_all_tickers()
    total = len(tickers)
    logger.info("총 %d개 종목 적재 시작 (~ %s)", total, end)

    success, skip, error = 0, 0, 0

    for i, ticker in enumerate(tickers, 1):
        start = get_last_date(ticker)

        if start > end:
            logger.debug(
                "최신 상태 유지 중: %s (start=%s > end=%s)", ticker, start, end
            )
            skip += 1
        else:
            count = fetch_and_insert(ticker, start, end)

            if count > 0:
                success += 1
            elif count == 0:
                skip += 1
            else:  # -1
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

        time.sleep(0.3)  # KRX 요청 간격

    logger.info("완료: 성공=%d, 스킵=%d, 오류=%d", success, skip, error)


if __name__ == "__main__":
    end = (datetime.today() - timedelta(days=1)).strftime("%Y%m%d")
    run(end)
