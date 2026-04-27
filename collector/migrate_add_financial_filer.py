"""
Migration: stocks.is_financial_filer 컬럼 추가

is_financial_filer TINYINT NULL
  1   : DART 재무제표 공시 이력 있음 (fetch_financials 호출 대상)
  0   : 공시 이력 없음 (ETF·우선주·스팩 등 — 호출 스킵)
  NULL: 미확인 (신규 상장 등 — 일단 호출 대상에 포함)

초기값:
  financial_statements에 행 있는 ticker → 1
  corp_code 없거나 비활성 → 해당 없음 (변경 안 함)
  그 외 → 0
"""

import os
from dotenv import load_dotenv
import mysql.connector

load_dotenv()

db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cursor = db.cursor()


def run():
    # 1. 컬럼 추가 (이미 있으면 스킵)
    cursor.execute("SHOW COLUMNS FROM stocks LIKE 'is_financial_filer'")
    if cursor.fetchone():
        print("이미 존재: stocks.is_financial_filer — 컬럼 추가 스킵")
    else:
        cursor.execute(
            "ALTER TABLE stocks ADD COLUMN is_financial_filer TINYINT NULL DEFAULT NULL"
        )
        db.commit()
        print("완료: stocks.is_financial_filer 컬럼 추가")

    # 2. 적재 이력 있는 ticker → 1
    cursor.execute(
        """
        UPDATE stocks s
        JOIN (SELECT DISTINCT ticker FROM financial_statements) f
          ON s.ticker = f.ticker
        SET s.is_financial_filer = 1
        """
    )
    updated_1 = cursor.rowcount
    db.commit()
    print(f"is_financial_filer = 1 설정: {updated_1}개 (DART 공시 이력 있음)")

    # 3. corp_code 있고 is_active=1이지만 적재 이력 없는 ticker → 0
    cursor.execute(
        """
        UPDATE stocks
        SET is_financial_filer = 0
        WHERE corp_code IS NOT NULL
          AND is_active = 1
          AND is_financial_filer IS NULL
        """
    )
    updated_0 = cursor.rowcount
    db.commit()
    print(f"is_financial_filer = 0 설정: {updated_0}개 (공시 이력 없음)")

    # 4. 결과 확인
    cursor.execute(
        """
        SELECT is_financial_filer, COUNT(*) as cnt
        FROM stocks
        GROUP BY is_financial_filer
        ORDER BY is_financial_filer DESC
        """
    )
    print("\n최종 분포:")
    for row in cursor.fetchall():
        label = {1: "공시 있음", 0: "공시 없음", None: "미확인(NULL)"}
        print(f"  is_financial_filer={row[0]} ({label.get(row[0], '?')}): {row[1]}개")


if __name__ == "__main__":
    run()
