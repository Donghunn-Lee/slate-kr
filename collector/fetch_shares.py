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
from dotenv import load_dotenv
from typing import Optional, Tuple

from db import get_connection

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

# 발행주식수 상한 클리핑 — 전세계 최대 발행주식수 종목도 100억주 미만.
# 229640 사례처럼 DART 원본이 ×10^6 오태그로 반환되는 케이스 방어.
SHARES_CAP = 1e11


def get_latest_bsns_year() -> str:
    """사업보고서는 4월 이후 공시 → 4월부터 전년도, 3월까지는 전전년도"""
    today = datetime.today()
    return str(today.year - 1 if today.month >= 4 else today.year - 2)


def fetch_stock_amount(corp_code: str) -> Tuple[Optional[int], Optional[str]]:
    """
    반환값 규약:
      (int, None)     : 발행주식총수 (success)
      (None, reason)  : skip — reason ∈ {"status", "no_row", "parse"}
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
        return None, "status"

    # 보통주 / 의결권있는 주식 행의 istc_totqy 사용.
    # 대형 지주·제조사는 "의결권 있는 (\n)주식" 템플릿을 쓰고 공백·개행 위치가 filer별로
    # 다르므로 se 의 모든 공백을 제거한 뒤 접두어로 매칭.
    for item in data.get("list", []):
        se = "".join((item.get("se") or "").split())
        if se.startswith("보통주") or se.startswith("의결권있는"):
            raw = item.get("istc_totqy", "").replace(",", "").strip()
            try:
                val = int(raw)
                return (val, None) if val > 0 else (None, "parse")
            except (ValueError, TypeError):
                return None, "parse"

    return None, "no_row"


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
    skip_reasons = {"status": 0, "no_row": 0, "parse": 0, "cap": 0}

    for i, (ticker, corp_code) in enumerate(rows, 1):
        try:
            amount, reason = fetch_stock_amount(corp_code)
        except Exception as e:
            logger.error("요청 실패 %s (%s): %s", ticker, corp_code, e)
            error += 1
            time.sleep(0.2)
            continue

        if amount is not None and amount >= SHARES_CAP:
            logger.warning(
                "[SHARES_CAP_SKIP] ticker=%s corp_code=%s raw=%s cap=%s — 미갱신",
                ticker,
                corp_code,
                f"{amount:,}",
                f"{SHARES_CAP:,.0f}",
            )
            amount = None
            reason = "cap"

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
            skip_reasons[reason] += 1

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

    logger.info(
        "완료: 성공=%d, 스킵=%d (status=%d, 행미발견=%d, 파싱=%d, CAP=%d), 오류=%d",
        success,
        skip,
        skip_reasons["status"],
        skip_reasons["no_row"],
        skip_reasons["parse"],
        skip_reasons["cap"],
        error,
    )
    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
