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

from dotenv import load_dotenv

from db import get_connection

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

# 종목 커버리지 하한 — expected 날짜 row 수가 직전 거래일의 이 비율 미만이면 FAIL.
# #108 fetch_prices 30분 timeout 으로 1579/2647 = 59.7% 부분 적재가 MAX(date) 검사만
# 통과해 silent PASS 된 사고 대응. 신규 DB(직전 baseline 부재) 는 WARN + skip.
ROW_COUNT_FLOOR_RATIO = 0.9

# 국내 지수 EOD 하한 (#120 F61).
# fetch_index_prices.py INDEX_CODE_TO_ISCD = {KOSPI, KOSDAQ, KOSPI200, KOSDAQ150} — 4종.
# index_daily_prices 는 해외 지수(8종) 도 공유하는 테이블이라 MAX(base_date) 만으로는
# 국내 EOD 부분 실패를 잡지 못함(#119 F56 관측). 국내 4종 전량 적재를 명시적으로 검사.
DOMESTIC_INDEX_CODES = ("KOSPI", "KOSDAQ", "KOSPI200", "KOSDAQ150")


def is_trading_day(d: date) -> bool:
    if d.weekday() >= 5:  # 5=토, 6=일
        return False
    return d.isoformat() not in KRX_HOLIDAYS_2026


def compute_expected(today_kst: date) -> date:
    d = today_kst
    while not is_trading_day(d):
        d = d - timedelta(days=1)
    return d


def compute_expected_from_now(now_kst: datetime) -> date:
    """오늘이 KRX 거래일이고 KST ≥ 16:00 이면 오늘, 아니면 직전 거래일.
    fetch_prices.py / fetch_index_prices.py 의 end 캡과 동일 기준."""
    today = now_kst.date()
    if is_trading_day(today) and now_kst.hour >= 16:
        return today
    return compute_expected(today - timedelta(days=1))


def get_max(cursor, table: str, col: str) -> date | None:
    cursor.execute(f"SELECT MAX({col}) FROM {table}")
    return cursor.fetchone()[0]


def check_row_count_floor(cursor, expected: date) -> str | None:
    """daily_prices expected 날짜 row 수가 직전 거래일의 ROW_COUNT_FLOOR_RATIO 미만이면
    실패 사유 문자열 반환. OK/WARN 경로는 None + stdout 로그."""
    cursor.execute("SELECT COUNT(*) FROM daily_prices WHERE date = %s", (expected,))
    (cur_cnt,) = cursor.fetchone()
    cursor.execute(
        "SELECT MAX(date) FROM daily_prices WHERE date < %s", (expected,)
    )
    (prev_date,) = cursor.fetchone()
    if prev_date is None:
        print(
            f"  ?? daily_prices rows {cur_cnt} — 직전 baseline 없음, 하한 검사 skip"
        )
        return None
    cursor.execute("SELECT COUNT(*) FROM daily_prices WHERE date = %s", (prev_date,))
    (prev_cnt,) = cursor.fetchone()
    if prev_cnt == 0:
        print(
            f"  ?? daily_prices rows {cur_cnt} — 직전({prev_date}) count=0, 하한 검사 skip"
        )
        return None
    ratio = cur_cnt / prev_cnt
    floor_pct = int(ROW_COUNT_FLOOR_RATIO * 100)
    if ratio >= ROW_COUNT_FLOOR_RATIO:
        print(
            f"  OK daily_prices rows {cur_cnt}/{prev_cnt} (floor {floor_pct}%)"
        )
        return None
    print(
        f"  !! daily_prices rows {cur_cnt}/{prev_cnt} = {ratio * 100:.1f}% < {floor_pct}%"
    )
    return (
        f"daily_prices rows {cur_cnt}/{prev_cnt} = {ratio * 100:.1f}% < {floor_pct}%"
    )


def check_index_row_count_floor(cursor, expected: date) -> str | None:
    """index_daily_prices expected 날짜에 국내 지수 4종이 모두 적재됐는지 검사.
    부분 적재(<4) 는 실패 사유 문자열 반환. OK/skip 경로는 None + stdout 로그."""
    cursor.execute(
        "SELECT COUNT(DISTINCT index_code) FROM index_daily_prices "
        "WHERE base_date = %s AND index_code = ANY(%s)",
        (expected, list(DOMESTIC_INDEX_CODES)),
    )
    (cur_cnt,) = cursor.fetchone()
    floor = len(DOMESTIC_INDEX_CODES)
    if cur_cnt >= floor:
        print(f"  OK index_daily_prices domestic indices {cur_cnt}/{floor}")
        return None
    print(f"  !! index_daily_prices domestic indices {cur_cnt}/{floor}")
    return f"index_daily_prices domestic indices {cur_cnt}/{floor}"


def main() -> None:
    if not os.getenv("DATABASE_URL"):
        print("verify: DATABASE_URL 미설정", file=sys.stderr)
        sys.exit(1)

    now_kst = datetime.now(timezone.utc) + timedelta(hours=9)
    if _FORCE:
        try:
            expected = datetime.strptime(_FORCE, "%Y-%m-%d").date()
            print(f"verify: VERIFY_FORCE_EXPECTED={expected} (override)")
        except ValueError:
            print(f"verify: VERIFY_FORCE_EXPECTED 형식 오류 '{_FORCE}'", file=sys.stderr)
            sys.exit(2)
    else:
        expected = compute_expected_from_now(now_kst)

    print(f"verify: now(KST)={now_kst:%Y-%m-%d %H:%M:%S}  expected={expected}")

    conn = get_connection()
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
        floor_fail = check_row_count_floor(cur, expected)
        if floor_fail:
            failures.append(floor_fail)
        idx_floor_fail = check_index_row_count_floor(cur, expected)
        if idx_floor_fail:
            failures.append(idx_floor_fail)
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
