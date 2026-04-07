import os
import requests
import mysql.connector
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

FSS_API_KEY = os.getenv("FSS_API_KEY")

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

def fetch_stock_list() -> list[dict]:
    biz_date = get_latest_biz_date()
    print(f"기준일자: {biz_date}")
    url = "https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo"
    result = []
    page = 1
    num_of_rows = 1000

    while True:
        res = requests.get(url, params={
            "serviceKey": FSS_API_KEY,
            "resultType": "json",
            "numOfRows": num_of_rows,
            "pageNo": page,
            "basDt": biz_date,
        })
        res.raise_for_status()
        data = res.json()

        body = data["response"]["body"]
        items = body["items"]["item"]
        total = body["totalCount"]

        for item in items:
            market = item.get("mrktCtg", "")
            if market not in ("KOSPI", "KOSDAQ"):
                continue

            ticker = item.get("srtnCd", "").lstrip("A")
            name = item.get("itmsNm", "").strip()

            if not ticker or not name:
                continue

            result.append({
                "ticker": ticker,
                "name": name,
                "market": market,
            })

        if page * num_of_rows >= total:
            break
        page += 1

    return result

def upsert_stocks(conn, stocks: list[dict]):
    cursor = conn.cursor()
    sql = """
        INSERT INTO stocks (ticker, name, market)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            market = VALUES(market),
            updated_at = CURRENT_TIMESTAMP
    """
    rows = [(s["ticker"], s["name"], s["market"]) for s in stocks]
    cursor.executemany(sql, rows)
    conn.commit()
    print(f"{len(rows)}개 종목 upsert 완료")
    cursor.close()

def get_latest_biz_date() -> str:
    """오늘이 월요일이면 금요일, 아니면 어제"""
    today = datetime.now()
    if today.weekday() == 0:  # 월요일
        target = today - timedelta(days=3)
    else:
        target = today - timedelta(days=1)
    return target.strftime("%Y%m%d")

def main():
    print("KRX 상장종목 조회 중...")
    stocks = fetch_stock_list()
    print(f"KOSPI/KOSDAQ 종목 수: {len(stocks)}")

    conn = get_connection()
    try:
        upsert_stocks(conn, stocks)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
