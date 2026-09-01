"""
일일 적재 후 freshness 검증.

모드 (argparse --mode)
  full (기본값)   국내 EOD(daily_prices, index_daily_prices) + 국내 지수 1분봉 4종 하한.
                  expected: 거래일이면 today(KST), 아니면 직전 거래일.
                  거래일 판정: market_trading_days(KRX) 우선, 부재 시 KRX_HOLIDAYS_2026 폴백.
  overseas-only   해외 EOD(index_daily_prices 8종) + 해외 intraday(overseas_index_intraday 7종) 하한.
                  expected: KST 오늘 - 1일. 주말이면 섹션 전체 skip.
                  시장 개장 여부는 market_trading_days(US·JP·HK·CN) + 정적 XETRA 캘린더(DE) 참조.

exit code
  0  전 검사 통과
  1  하나라도 실패 (stderr 로 사유 목록)
"""

from __future__ import annotations

import argparse
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
# 폴백 전용: market_trading_days 조회에 실패했거나 조회 창 밖의 날짜일 때만 사용.
# 정상 경로는 load_krx_calendar() 로드 결과 우선.
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

# 국내 지수 1분봉 하한.
# fetch_index_minute.py 가 채우는 domestic_index_intraday 4종 공통.
# 정규장 393분(09:00~15:30) × 0.9 = 353 (#108류 부분 적재 silent PASS 방어).
DOMESTIC_INTRADAY_FLOOR = 353

# ── 해외 검사 (--mode overseas-only) ─────────────────────────────
# EOD 8종: index_daily_prices 에 base_date=expected 행이 있어야 한다.
# intraday 7종: overseas_index_intraday count ≥ 실측 완전세션 × 0.9.
#   .DJI 는 intraday 미수집이라 EOD 만 검사.
OVERSEAS_EOD_CODES = ("SPX", ".DJI", "COMP", "NDX", "NI225", "HSI", "SHCOMP", "DAX")
OVERSEAS_INTRADAY_CODES = ("SPX", "COMP", "NDX", "NI225", "HSI", "SHCOMP", "DAX")

# 실측 baseline (2026-08-31 완전세션) × 0.9.
OVERSEAS_INTRADAY_FLOOR = {
    "SPX":    370,
    "COMP":   365,
    "NDX":    365,
    "NI225":  300,
    "HSI":    320,
    "SHCOMP": 216,
    "DAX":    459,
}

# 지수 → 시장. market_trading_days.market 과 정합 (DE 는 예외).
INDEX_MARKET = {
    "SPX":    "US",
    ".DJI":   "US",
    "COMP":   "US",
    "NDX":    "US",
    "NI225":  "JP",
    "HSI":    "HK",
    "SHCOMP": "CN",
    "DAX":    "DE",
}

# XETRA 는 CTOS5011R 미커버라 정적 상수. 갱신 주기: 연 1회.
# Deutsche Börse 공식 캘린더(2026): 12/24, 12/25, 12/31.
XETRA_HOLIDAYS_2026 = frozenset({"2026-12-24", "2026-12-25", "2026-12-31"})

# 반나절 세션. 이 날짜의 floor 는 //2 로 낮춘다.
HALF_DAY_2026 = {
    "US": frozenset({"2026-11-27", "2026-12-24"}),  # Thanksgiving 익일, Christmas Eve
    "HK": frozenset({"2026-12-24", "2026-12-31"}),  # Christmas Eve, New Year's Eve
}


def is_trading_day(d: date, calendar: dict[date, bool] | None = None) -> bool:
    """calendar 에 d 가 있으면 그 값(우선), 없으면 주말+KRX_HOLIDAYS_2026 폴백."""
    if calendar is not None and d in calendar:
        return calendar[d]
    if d.weekday() >= 5:  # 5=토, 6=일
        return False
    return d.isoformat() not in KRX_HOLIDAYS_2026


def compute_expected(today_kst: date, calendar: dict[date, bool] | None = None) -> date:
    d = today_kst
    while not is_trading_day(d, calendar):
        d = d - timedelta(days=1)
    return d


def compute_expected_from_now(now_kst: datetime,
                              calendar: dict[date, bool] | None = None) -> date:
    """오늘이 KRX 거래일이고 KST ≥ 16:00 이면 오늘, 아니면 직전 거래일.
    fetch_prices.py / fetch_index_prices.py 의 end 캡과 동일 기준."""
    today = now_kst.date()
    if is_trading_day(today, calendar) and now_kst.hour >= 16:
        return today
    return compute_expected(today - timedelta(days=1), calendar)


def load_krx_calendar(conn) -> dict[date, bool]:
    """market_trading_days market='KRX' 최근 ±45일 창을 dict[date -> is_open] 로 로드.
    실패 시 빈 dict 반환 (호출부는 자동으로 KRX_HOLIDAYS_2026 폴백).
    로드 결과와 정적 규칙이 다른 날짜(임시공휴일 등)는 stderr 로 1줄 로그."""
    today_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).date()
    lo = today_kst - timedelta(days=45)
    hi = today_kst + timedelta(days=45)
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT trade_date, is_open FROM market_trading_days "
                "WHERE market = 'KRX' AND trade_date BETWEEN %s AND %s",
                (lo, hi),
            )
            rows = cur.fetchall()
        finally:
            cur.close()
    except Exception as e:
        print(f"load_krx_calendar failed, fallback to static: {e}",
              file=sys.stderr)
        return {}

    calendar = {d: bool(o) for d, o in rows}
    for d, is_open in calendar.items():
        static_open = (d.weekday() < 5) and (d.isoformat() not in KRX_HOLIDAYS_2026)
        if static_open != is_open:
            print(
                f"KRX_HOLIDAYS_2026 mismatch: {d.isoformat()} "
                f"static={static_open} calendar={is_open}",
                file=sys.stderr,
            )
    return calendar


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


def check_domestic_intraday(cursor, expected: date) -> list[str]:
    """domestic_index_intraday 4종 각각 ts::date=expected count ≥ DOMESTIC_INTRADAY_FLOOR."""
    failures: list[str] = []
    for code in DOMESTIC_INDEX_CODES:
        cursor.execute(
            "SELECT COUNT(*) FROM domestic_index_intraday "
            "WHERE index_code = %s AND ts::date = %s",
            (code, expected),
        )
        (cnt,) = cursor.fetchone()
        if cnt >= DOMESTIC_INTRADAY_FLOOR:
            print(f"  OK domestic_index_intraday {code} {cnt}>={DOMESTIC_INTRADAY_FLOOR}")
        else:
            print(f"  !! domestic_index_intraday {code} {cnt}<{DOMESTIC_INTRADAY_FLOOR}")
            failures.append(
                f"domestic_index_intraday {code} {cnt}<{DOMESTIC_INTRADAY_FLOOR} ({expected})"
            )
    return failures


def check_overseas_section(cursor, expected: date) -> list[str]:
    """해외 EOD 8종 + intraday 7종. 시장 휴장이면 그 시장의 지수는 skip.
    시장 캘린더가 부재하면 실패로 취급하고 해당 시장의 지수는 skip."""
    failures: list[str] = []

    market_open: dict[str, bool | None] = {}
    for market in ("US", "JP", "HK", "CN"):
        cursor.execute(
            "SELECT is_open FROM market_trading_days "
            "WHERE market = %s AND trade_date = %s",
            (market, expected),
        )
        row = cursor.fetchone()
        if row is None:
            print(f"  !! calendar missing: {market} {expected}")
            failures.append(f"calendar missing: {market} {expected}")
            market_open[market] = None
        else:
            market_open[market] = bool(row[0])
    market_open["DE"] = expected.isoformat() not in XETRA_HOLIDAYS_2026

    for code in OVERSEAS_EOD_CODES:
        market = INDEX_MARKET[code]
        is_open = market_open.get(market)
        if is_open is None:
            print(f"  ?? {code} skip (calendar missing for {market} {expected})")
            continue
        if not is_open:
            print(f"  -- {code} closed, skip ({market} {expected})")
            continue

        cursor.execute(
            "SELECT 1 FROM index_daily_prices "
            "WHERE index_code = %s AND base_date = %s LIMIT 1",
            (code, expected),
        )
        if cursor.fetchone() is None:
            print(f"  !! {code} EOD row missing base_date={expected}")
            failures.append(f"{code} EOD row missing base_date={expected}")
        else:
            print(f"  OK {code} EOD present base_date={expected}")

        if code not in OVERSEAS_INTRADAY_CODES:
            continue
        floor = OVERSEAS_INTRADAY_FLOOR[code]
        half_note = ""
        if expected.isoformat() in HALF_DAY_2026.get(market, frozenset()):
            floor = floor // 2
            half_note = " (half-day)"
        cursor.execute(
            "SELECT COUNT(*) FROM overseas_index_intraday "
            "WHERE index_code = %s AND ts::date = %s",
            (code, expected),
        )
        (cnt,) = cursor.fetchone()
        if cnt >= floor:
            print(f"  OK {code} intraday {cnt}>={floor}{half_note}")
        else:
            print(f"  !! {code} intraday {cnt}<{floor}{half_note}")
            failures.append(
                f"{code} intraday {cnt}<{floor} ({expected}{half_note})"
            )
    return failures


def _run_full(cur, now_kst: datetime, calendar: dict[date, bool]) -> list[str]:
    if _FORCE:
        try:
            expected = datetime.strptime(_FORCE, "%Y-%m-%d").date()
            print(f"verify [full]: VERIFY_FORCE_EXPECTED={expected} (override)")
        except ValueError:
            print(f"verify [full]: VERIFY_FORCE_EXPECTED 형식 오류 '{_FORCE}'",
                  file=sys.stderr)
            sys.exit(2)
    else:
        expected = compute_expected_from_now(now_kst, calendar)

    print(f"verify [full]: now(KST)={now_kst:%Y-%m-%d %H:%M:%S}  expected={expected}")

    failures: list[str] = []
    for table, col in (("daily_prices", "date"), ("index_daily_prices", "base_date")):
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
    failures.extend(check_domestic_intraday(cur, expected))
    return failures


def _run_overseas_only(cur, now_kst: datetime) -> list[str]:
    expected = now_kst.date() - timedelta(days=1)
    print(f"verify [overseas-only]: now(KST)={now_kst:%Y-%m-%d %H:%M:%S}  expected={expected}")
    if expected.weekday() >= 5:
        print(f"  -- expected={expected} weekday={expected.weekday()} → 주말, 섹션 skip")
        return []
    return check_overseas_section(cur, expected)


def main() -> None:
    parser = argparse.ArgumentParser(description="일일 적재 freshness 검증")
    parser.add_argument(
        "--mode",
        choices=("full", "overseas-only"),
        default="full",
        help="full=국내 EOD+국내지수1분봉 / overseas-only=해외 EOD+intraday",
    )
    args = parser.parse_args()

    if not os.getenv("DATABASE_URL"):
        print("verify: DATABASE_URL 미설정", file=sys.stderr)
        sys.exit(1)

    now_kst = datetime.now(timezone.utc) + timedelta(hours=9)

    conn = get_connection()
    try:
        calendar = load_krx_calendar(conn)
        cur = conn.cursor()
        if args.mode == "full":
            failures = _run_full(cur, now_kst, calendar)
        else:
            failures = _run_overseas_only(cur, now_kst)
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
