"""
일일 적재 후 freshness 검증. daily_prices / index_daily_prices 의 MAX 가
today(KST) 기준 expected 거래일과 일치해야 한다.

expected 산출
  today(KST) 가 거래일이면 today, 아니면 직전 거래일.
  거래일 = 주말 아님 AND KRX_HOLIDAYS_2026 미포함.

exit code
  0  두 테이블 모두 expected 와 일치
  1  하나라도 불일치 (stderr 로 어느 테이블·어느 날짜에 멈췄는지 출력)

해외 지수는 이번 범위에서 제외 — US 휴장 캘린더 별도 이슈(F27 잔여).
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta, timezone

import psycopg2
from dotenv import load_dotenv

load_dotenv()

# ── KRX_HOLIDAYS_2026 ────────────────────────────────────────────
# 출처: web/src/shared/utils/krxHolidays.ts (#064 도입).
# 갱신 주기: 연 1회 — 양쪽 동시 갱신 필요 (Python·TypeScript 상수 동시 반영).
# 임시공휴일(보궐선거 등) 발생 시 추가.
KRX_HOLIDAYS_2026: frozenset[str] = frozenset([
    "2026-01-01",  # 신정
    "2026-02-16",  # 설날 연휴
    "2026-02-17",  # 설날
    "2026-02-18",  # 설날 연휴
    "2026-03-02",  # 삼일절 대체공휴일
    "2026-05-01",  # 근로자의 날
    "2026-05-05",  # 어린이날
    "2026-05-25",  # 부처님오신날 대체공휴일
    "2026-06-03",  # 제8회 전국동시지방선거
    "2026-07-17",  # 제헌절 대체공휴일
    "2026-08-17",  # 광복절 대체공휴일
    "2026-09-24",  # 추석 연휴
    "2026-09-25",  # 추석
    "2026-10-05",  # 개천절 대체공휴일
    "2026-10-09",  # 한글날
    "2026-12-25",  # 성탄절
    "2026-12-31",  # 연말 휴장
])

# ── 테스트 편의: expected 강제 오버라이드 ──────────────────────
# 환경변수 VERIFY_FORCE_EXPECTED=YYYY-MM-DD 지정 시 계산 로직을 우회.
# 프로덕션 워크플로우에선 미설정. fail 경로 로컬 검증용.
_FORCE = os.getenv("VERIFY_FORCE_EXPECTED")


def is_trading_day(d: date) -> bool:
    if d.weekday() >= 5:  # 5=토, 6=일
        return False
    return d.isoformat() not in KRX_HOLIDAYS_2026


def compute_expected(today_kst: date) -> date:
    d = today_kst
    while not is_trading_day(d):
        d = d - timedelta(days=1)
    return d


def get_max(cursor, table: str, col: str) -> date | None:
    cursor.execute(f"SELECT MAX({col}) FROM {table}")
    return cursor.fetchone()[0]


def main() -> None:
    if not os.getenv("DATABASE_URL"):
        print("verify: DATABASE_URL 미설정", file=sys.stderr)
        sys.exit(1)

    today_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).date()
    if _FORCE:
        try:
            expected = datetime.strptime(_FORCE, "%Y-%m-%d").date()
            print(f"verify: VERIFY_FORCE_EXPECTED={expected} (override)")
        except ValueError:
            print(f"verify: VERIFY_FORCE_EXPECTED 형식 오류 '{_FORCE}'", file=sys.stderr)
            sys.exit(2)
    else:
        expected = compute_expected(today_kst)

    print(f"verify: today(KST)={today_kst}  expected={expected}")

    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    try:
        cur = conn.cursor()
        checks = [
            ("daily_prices", "date"),
            ("index_daily_prices", "base_date"),
        ]
        failures: list[str] = []
        for table, col in checks:
            mx = get_max(cur, table, col)
            ok = mx == expected
            mark = "OK " if ok else "!! "
            print(f"  {mark}{table}.MAX({col}) = {mx}  (expected {expected})")
            if not ok:
                failures.append(f"{table}.MAX({col})={mx} != expected {expected}")
        cur.close()
    finally:
        conn.close()

    if failures:
        for msg in failures:
            print(f"verify: FAIL — {msg}", file=sys.stderr)
        sys.exit(1)
    print("verify: PASS")


if __name__ == "__main__":
    main()
