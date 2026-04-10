import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import mysql.connector
from pykrx import stock as krx
import time

load_dotenv()

db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cursor = db.cursor()


def fetch_and_insert(ticker: str, start: str, end: str) -> int:
    try:
        df = krx.get_market_ohlcv(start, end, ticker)
    except Exception as e:
        print(f"[ERROR] pykrx 호출 실패 {ticker}: {e}")
        return 0

    if df is None or df.empty:
        print(f"[SKIP] 데이터 없음: {ticker} ({start}~{end})")
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
    cursor.executemany(sql, rows)
    db.commit()

    return len(rows)


def get_all_tickers() -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = 1")
    return [row[0] for row in cursor.fetchall()]


def run(start: str, end: str):
    tickers = get_all_tickers()
    total = len(tickers)
    print(f"총 {total}개 종목 적재 시작 ({start} ~ {end})")

    success, skip, error = 0, 0, 0

    for i, ticker in enumerate(tickers, 1):
        count = fetch_and_insert(ticker, start, end)

        if count > 0:
            success += 1
        else:
            skip += 1

        if i % 100 == 0:
            print(f"  진행: {i}/{total} (성공={success}, 스킵={skip}, 오류={error})")

        time.sleep(0.3)  # KRX 요청 간격

    print(f"\n완료: 성공={success}, 스킵={skip}, 오류={error}")


if __name__ == "__main__":
    end = datetime.today().strftime("%Y%m%d")
    start = (datetime.today() - timedelta(days=365)).strftime("%Y%m%d")
    run(start, end)
