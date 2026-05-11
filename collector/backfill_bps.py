"""
financial_statements.bps 백필 스크립트.

bps가 NULL인 row를 대상으로 stocks.shares를 JOIN해서
BPS = ROUND(total_equity / shares) 로 UPDATE한다.

멱등성 보장: WHERE bps IS NULL 조건으로만 처리하므로
여러 번 실행해도 이미 채워진 row는 건드리지 않는다.
"""

import logging
import os
from datetime import datetime
from dotenv import load_dotenv
import mysql.connector

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"backfill_bps_{datetime.today().strftime('%Y%m%d')}.log"
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


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


def main():
    conn = get_connection()
    cursor = conn.cursor()

    # bps NULL + total_equity 유효 + shares 유효인 row만 조회
    cursor.execute(
        """
        SELECT fs.id, fs.total_equity, s.shares
        FROM financial_statements fs
        JOIN stocks s ON fs.ticker = s.ticker
        WHERE fs.bps IS NULL
          AND fs.total_equity IS NOT NULL
          AND s.shares IS NOT NULL
          AND s.shares > 0
        """
    )
    rows = cursor.fetchall()
    total_candidates = len(rows)
    logger.info("백필 대상: %d건", total_candidates)

    updated, skipped, error = 0, 0, 0

    for row_id, total_equity, shares in rows:
        try:
            bps = round(total_equity / shares)
            cursor.execute(
                "UPDATE financial_statements SET bps = %s WHERE id = %s",
                (bps, row_id),
            )
            conn.commit()
            updated += 1
        except Exception as e:
            logger.error("UPDATE 실패 id=%s: %s", row_id, e)
            conn.rollback()
            error += 1

    # bps NULL이지만 조건 미충족(total_equity NULL 또는 shares NULL/0)인 건수
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM financial_statements fs
        LEFT JOIN stocks s ON fs.ticker = s.ticker
        WHERE fs.bps IS NULL
          AND (fs.total_equity IS NULL OR s.shares IS NULL OR s.shares = 0)
        """
    )
    skipped = cursor.fetchone()[0]

    logger.info(
        "완료: updated=%d, skipped(조건 미충족)=%d, error=%d",
        updated,
        skipped,
        error,
    )

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
