"""
DART CORPCODE.xml에서 stock_code → corp_code 매핑을 받아
stocks.corp_code 를 채운다.

기본 모드는 dry-run — 현재 corp_code NULL 종목에 대해 매핑 가능 여부를
리포트만 출력하고 DB는 건드리지 않는다. 실제 UPDATE 는 --execute 플래그가
있을 때만 실행된다.
"""

import argparse
import io
import logging
import os
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from typing import Optional

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"corp_codes_{datetime.today().strftime('%Y%m%d')}.log"
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

DART_API_KEY = os.getenv("DART_API_KEY")


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def fetch_corp_codes() -> dict[str, str]:
    """DART corpCode.xml에서 stock_code(=ticker) → corp_code 매핑 반환."""
    url = "https://opendart.fss.or.kr/api/corpCode.xml"
    res = requests.get(url, params={"crtfc_key": DART_API_KEY}, timeout=30)
    res.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)

    mapping: dict[str, str] = {}
    for item in tree.getroot().findall("list"):
        stock_code = (item.findtext("stock_code") or "").strip()
        corp_code = (item.findtext("corp_code") or "").strip()
        if stock_code and corp_code:
            mapping[stock_code] = corp_code

    return mapping


def run_execute(cursor, conn, mapping: dict[str, str]) -> int:
    """원 스크립트 방식: 매핑 전체에 대해 UPDATE (idempotent)."""
    sql = "UPDATE stocks SET corp_code = %s WHERE ticker = %s"
    pairs = [(cc, t) for t, cc in mapping.items()]
    cursor.executemany(sql, pairs)
    conn.commit()
    return cursor.rowcount


def report_null_targets(
    cursor, mapping: dict[str, str]
) -> tuple[list[tuple[str, str, str]], list[tuple[str, str]]]:
    """현재 corp_code NULL 종목을 조회해 매핑됨/미매핑으로 분류."""
    cursor.execute(
        "SELECT ticker, name FROM stocks "
        "WHERE corp_code IS NULL AND is_active = true "
        "ORDER BY ticker"
    )
    rows = cursor.fetchall()

    matched: list[tuple[str, str, str]] = []
    unmatched: list[tuple[str, str]] = []
    for ticker, name in rows:
        cc: Optional[str] = mapping.get(ticker)
        if cc:
            matched.append((ticker, name, cc))
        else:
            unmatched.append((ticker, name))
    return matched, unmatched


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="실제 UPDATE 실행 (기본은 dry-run)",
    )
    args = parser.parse_args()
    dry_run = not args.execute

    logger.info("DART CORPCODE.xml 다운로드 중...")
    mapping = fetch_corp_codes()
    logger.info("DART 매핑 항목: %d개", len(mapping))

    conn = get_connection()
    cursor = conn.cursor()
    try:
        matched, unmatched = report_null_targets(cursor, mapping)

        logger.info("=" * 60)
        logger.info("리포트: corp_code NULL 종목 매핑 결과")
        logger.info("=" * 60)

        if matched:
            logger.info("[매핑됨] %d건", len(matched))
            for ticker, name, cc in matched:
                logger.info("  %s  %-20s  →  %s", ticker, name, cc)
        else:
            logger.info("[매핑됨] 0건")

        if unmatched:
            logger.info("[DART 미매핑] %d건", len(unmatched))
            for ticker, name in unmatched:
                logger.info("  %s  %-20s  (no DART match)", ticker, name)
        else:
            logger.info("[DART 미매핑] 0건")

        logger.info(
            "요약: 매핑 %d건 / 미매핑 %d건 / DART 매핑 총 %d건",
            len(matched),
            len(unmatched),
            len(mapping),
        )

        if dry_run:
            logger.info("dry-run 모드 — DB 변경 없음. 실행하려면 --execute 플래그.")
        else:
            updated = run_execute(cursor, conn, mapping)
            logger.info("UPDATE 완료: %d건", updated)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
