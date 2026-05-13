"""
DART /api/stockTotqySttus.json 으로 발행주식총수(istc_totqy)를 가져와
stocks.shares 를 업데이트한다.

corp_code 가 있는 종목만 처리 가능. (update_corp_codes.py 선행 필요)
"""

import logging
import os
import time
from datetime import datetime
import requests
import psycopg2
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"shares_{datetime.today().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

DART_API_KEY = os.getenv("DART_API_KEY")


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def get_latest_bsns_year() -> str:
    """사업보고서는 4월 이후 공시 → 4월부터 전년도, 3월까지는 전전년도"""
    today = datetime.today()
    return str(today.year - 1 if today.month >= 4 else today.year - 2)


def fetch_stock_amount(corp_code: str) -> Optional[int]:
    """
    반환값 규약:
      양수 int : 발행주식총수 (success)
      None     : DART 미공시 / 보통주 행 없음 (skip)
    네트워크 오류 등 요청 자체 실패 시 예외를 상위로 전파.
    """
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
        "SELECT ticker, corp_code FROM stocks WHERE corp_code IS NOT NULL AND is_active = true"
    )
    rows = cursor.fetchall()
    total = len(rows)
    logger.info("대상 종목: %d개", total)

    success, skip, error = 0, 0, 0

    for i, (ticker, corp_code) in enumerate(rows, 1):
        try:
            amount = fetch_stock_amount(corp_code)
        except Exception as e:
            logger.error("요청 실패 %s (%s): %s", ticker, corp_code, e)
            error += 1
            time.sleep(0.2)
            continue

        if amount is not None:
            try:
                cursor.execute(
                    "UPDATE stocks SET shares = %s WHERE ticker = %s",
                    (amount, ticker),
                )
                conn.commit()
                success += 1
            except Exception as e:
                logger.error("DB 업데이트 실패 %s: %s", ticker, e)
                conn.rollback()
                error += 1
        else:
            logger.debug("DART 미공시 또는 보통주 행 없음, 스킵: %s", ticker)
            skip += 1

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                error,
            )

        time.sleep(0.2)

    logger.info("완료: 성공=%d, 스킵=%d, 오류=%d", success, skip, error)
    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
