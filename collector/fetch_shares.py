"""
DART /api/stockTotqySttus.json 으로 발행주식총수(istc_totqy)를 가져와
stocks.shares 를 업데이트한다.

corp_code 가 있는 종목만 처리 가능. (update_corp_codes.py 선행 필요)
"""

import os
import time
from datetime import datetime
import requests
import mysql.connector
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

DART_API_KEY = os.getenv("DART_API_KEY")


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


def get_latest_bsns_year() -> str:
    """사업보고서는 4월 이후 공시 → 4월부터 전년도, 3월까지는 전전년도"""
    today = datetime.today()
    return str(today.year - 1 if today.month >= 4 else today.year - 2)


def fetch_stock_amount(corp_code: str) -> Optional[int]:
    try:
        res = requests.get(
            "https://opendart.fss.or.kr/api/stockTotqySttus.json",
            params={
                "crtfc_key": DART_API_KEY,
                "corp_code": corp_code,
                "bsns_year": get_latest_bsns_year(),
                "reprt_code": "11011",  # 사업보고서
            },
            timeout=10,
        )
        data = res.json()
    except Exception as e:
        print(f"[ERROR] 요청 실패 {corp_code}: {e}")
        return None

    if data.get("status") != "000":
        return None

    # 보통주 행의 istc_totqy(발행주식총수) 사용
    for item in data.get("list", []):
        if item.get("se") == "보통주":
            raw = item.get("istc_totqy", "").replace(",", "").strip()
            try:
                val = int(raw)
                return val if val > 0 else None
            except (ValueError, TypeError):
                return None

    return None


def main():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT ticker, corp_code FROM stocks WHERE corp_code IS NOT NULL AND is_active = 1"
    )
    rows = cursor.fetchall()
    total = len(rows)
    print(f"대상 종목: {total}개")

    success, skip, error = 0, 0, 0

    for i, (ticker, corp_code) in enumerate(rows, 1):
        amount = fetch_stock_amount(corp_code)

        if amount is not None:
            cursor.execute(
                "UPDATE stocks SET shares = %s WHERE ticker = %s",
                (amount, ticker),
            )
            conn.commit()
            success += 1
        else:
            skip += 1

        if i % 100 == 0:
            print(f"  진행: {i}/{total} (성공={success}, 스킵={skip})")

        time.sleep(0.2)

    print(f"\n완료: 성공={success}, 스킵={skip}")
    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
