"""
KRX Marketplace sto/stk_isu_base_info → stocks.listed_at 채움.

용도
  신규 상장 종목의 상장일 컬럼(listed_at) 유입. 대상은 매주 증가하는 신규 상장이므로
  1회 백필이 아니라 weekly 편성. 기존 값은 write-once — NULL 인 곳만 채운다.

호출 (실행당 2회)
  sto/stk_isu_base_info  → KOSPI 상장 종목 base info
  sto/ksq_isu_base_info  → KOSDAQ 상장 종목 base info
  (지수 backfill 과 동일 패턴 — 시장별 endpoint 분리, mktId 파라미터는 무시됨)

적재
  UPDATE stocks SET listed_at = %s WHERE ticker = %s AND listed_at IS NULL
    · listed_at IS NULL 조건으로 idempotent (재실행 시 UPDATE 0행)
    · 응답의 우선주·미상장·stocks 미보유 티커는 skip
    · LIST_DD 가 YYYYMMDD 8자리 아니거나 미래 날짜면 skip + WARN
"""

import logging
import os
import sys
from datetime import datetime

import requests
from dotenv import load_dotenv

from db import get_connection
from fetch_stocks import get_latest_biz_date

load_dotenv()

KRX_KEY = os.getenv("KRX_OPEN_API_KEY")
KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis"

_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"listed_at_{datetime.today().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
    # fetch_stocks 를 import 하면 그쪽 모듈 로드 시 root logger 에 stocks_YYYYMMDD.log
    # 핸들러가 먼저 설치되어 이 basicConfig 이 no-op 이 된다. force=True 로 재설정한다.
    force=True,
)
logger = logging.getLogger(__name__)

KRX_PATHS = ("sto/stk_isu_base_info", "sto/ksq_isu_base_info")


def _krx_call(bas_dd: str, path: str) -> list[dict]:
    r = requests.get(
        f"{KRX_BASE}/{path}",
        headers={"AUTH_KEY": (KRX_KEY or "").strip()},
        params={"basDd": bas_dd},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    return data.get("OutBlock_1") or []


def main():
    if not KRX_KEY:
        logger.error("KRX_OPEN_API_KEY 미설정 (collector/.env)")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        sys.exit(1)

    bas_dd = get_latest_biz_date()
    today = datetime.now().date()
    logger.info("기준일자 basDd=%s", bas_dd)

    all_rows: list[dict] = []
    for path in KRX_PATHS:
        try:
            rows = _krx_call(bas_dd, path)
        except Exception as e:
            logger.error("KRX 호출 실패 %s: %s", path, e)
            sys.exit(1)
        logger.info("응답 %s 행수=%d", path, len(rows))
        all_rows.extend(rows)

    if not all_rows:
        logger.warning("KRX 응답 총 0행 — 비거래일 가능성. 종료")
        return

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true")
    active = {t for (t,) in cursor.fetchall()}

    updated = 0
    skip_stock_missing = 0
    skip_bad_date = 0
    skip_future = 0
    seen: set[str] = set()

    try:
        for row in all_rows:
            ticker = (row.get("ISU_SRT_CD") or "").strip()
            list_dd_raw = (row.get("LIST_DD") or "").strip()
            if not ticker:
                continue
            seen.add(ticker)
            if ticker not in active:
                skip_stock_missing += 1
                continue

            if not list_dd_raw or len(list_dd_raw) != 8 or not list_dd_raw.isdigit():
                skip_bad_date += 1
                logger.warning("잘못된 LIST_DD ticker=%s raw=%r", ticker, list_dd_raw)
                continue
            try:
                parsed = datetime.strptime(list_dd_raw, "%Y%m%d").date()
            except ValueError:
                skip_bad_date += 1
                logger.warning("잘못된 LIST_DD ticker=%s raw=%r", ticker, list_dd_raw)
                continue
            if parsed > today:
                skip_future += 1
                logger.warning("미래 LIST_DD ticker=%s raw=%r", ticker, list_dd_raw)
                continue

            cursor.execute(
                "UPDATE stocks SET listed_at = %s WHERE ticker = %s AND listed_at IS NULL",
                (parsed, ticker),
            )
            updated += cursor.rowcount

        conn.commit()
    except Exception as e:
        logger.error("DB UPDATE 실패: %s", e)
        conn.rollback()
        cursor.close()
        conn.close()
        sys.exit(1)

    active_missing_in_response = len(active - seen)
    logger.info(
        "완료: 응답=%d, UPDATE=%d, skip_stocks미보유=%d, skip_잘못된날짜=%d, "
        "skip_미래날짜=%d, 활성_응답없음=%d",
        len(all_rows),
        updated,
        skip_stock_missing,
        skip_bad_date,
        skip_future,
        active_missing_in_response,
    )

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
