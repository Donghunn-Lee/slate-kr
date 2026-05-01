"""
Migration: disclosure_summaries 테이블 생성

AI 공시 요약 결과를 캐싱하는 테이블.
rcept_no(DART 공시 접수번호 14자리)를 PK로 사용해 공시당 단일 요약을 저장.

멱등성: CREATE TABLE IF NOT EXISTS — 재실행해도 에러 없음.
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
    print("마이그레이션 시작: disclosure_summaries 테이블 생성")

    # 테이블 생성 (IF NOT EXISTS — 멱등성)
    print("CREATE TABLE IF NOT EXISTS disclosure_summaries 실행 중...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS disclosure_summaries (
          rcept_no      VARCHAR(14)  NOT NULL,
          summary_text  TEXT         NOT NULL,
          model_name    VARCHAR(50)  NOT NULL,
          created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (rcept_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    db.commit()

    # 생성 결과 확인
    cursor.execute("SHOW TABLES LIKE 'disclosure_summaries'")
    if cursor.fetchone():
        print("완료: disclosure_summaries 테이블 존재 확인")
    else:
        print("오류: 테이블 생성 후에도 disclosure_summaries가 존재하지 않음")

    print("마이그레이션 종료")


if __name__ == "__main__":
    run()
