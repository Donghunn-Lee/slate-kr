"""
일일 적재 후 freshness 검증.

모드 (argparse --mode)
  full (기본값)   국내 EOD(daily_prices, index_daily_prices) + 국내 지수 1분봉 4종 하한
                  + 미처리 기업행위(기준가의 직전 봉 범위 이탈) 스캔.
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
from typing import NamedTuple

from dotenv import load_dotenv

from db import get_connection

load_dotenv()

# ── KRX_HOLIDAYS_2026 ────────────────────────────────────────────
# 출처: web/src/shared/utils/krxHolidays.ts.
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

# 종목 결손 허용치 — expected 날짜에 행이 없는 활성 종목이 이 수를 넘으면 FAIL.
# EOD 로더가 일부 종목만 적재한 날도 MAX(date) 검사는 통과하고, 직전 거래일 대비 비율
# 하한은 청크(30종목) 1개 유실을 통과시킨다 → 결손 종목 수로 부분 적재를 잡는다.
# 최근 10거래일 결손 최대 1(청크 유실일 제외) + 2 — 거래정지(prpr=0) 미적재 흡수용.
MISSING_ROWS_TOLERANCE = 3
# 로그에 싣는 결손 티커 상한.
MISSING_TICKERS_LOG_LIMIT = 40

# 국내 지수 EOD 하한.
# fetch_index_prices.py INDEX_CODE_TO_ISCD = {KOSPI, KOSDAQ, KOSPI200, KOSDAQ150} — 4종.
# index_daily_prices 는 해외 지수(8종) 도 공유하는 테이블이라 MAX(base_date) 만으로는
# 국내 EOD 부분 실패를 잡지 못한다. 국내 4종 전량 적재를 명시적으로 검사.
DOMESTIC_INDEX_CODES = ("KOSPI", "KOSDAQ", "KOSPI200", "KOSDAQ150")

# 국내 지수 1분봉 하한.
# fetch_index_minute.py 가 채우는 domestic_index_intraday 4종 공통.
# 정규장 393분(09:00~15:30) × 0.9 = 353 (부분 적재 silent PASS 방어).
DOMESTIC_INTRADAY_FLOOR = 353

# 미처리 기업행위.
# KIS_DAILY_LAST_DATE 이후 활성 종목 전 행에서 base_price 가 직전 저장 봉 [L, H] 를 1틱 초과해
# 벗어나면 FAIL — fetch_daily_close 의 WARN 이 exit 0 이라 로그에만 남아 방치되던 것 대응.
# 처리 = backfill_prices_kis.py --tickers + web/sql/rescale_corporate_action.sql 뒤 재스캔 0건.
# 재적재로 해소할 수 없는 건(kis_adj=0 등)만 사유 주석과 함께 (ticker, date) 로 등록 —
# 등록하면 FAIL 이 영구 억제되므로 원인 확인 후에만.
KNOWN_BASE_ADJ: frozenset[tuple[str, str]] = frozenset()

# 실패 사유에 싣는 이탈 건수 상한 (최근 날짜순). 초과분은 총계 1줄.
CORP_ACTION_REPORT_LIMIT = 10

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


def check_missing_rows(cursor, expected: date) -> str | None:
    """expected 날짜 daily_prices 행이 없는 활성 종목이 MISSING_ROWS_TOLERANCE 를 넘으면
    실패 사유 문자열 반환. OK 경로는 None. 양쪽 다 결손 수·티커를 stdout 로그."""
    cursor.execute(
        """
        SELECT s.ticker FROM stocks s
         WHERE s.is_active
           AND NOT EXISTS (
               SELECT 1 FROM daily_prices d
                WHERE d.ticker = s.ticker AND d.date = %s
           )
         ORDER BY s.ticker
        """,
        (expected,),
    )
    missing = [r[0] for r in cursor.fetchall()]
    msg = f"daily_prices missing {len(missing)} active (tolerance {MISSING_ROWS_TOLERANCE})"
    if missing:
        msg += ": " + " ".join(missing[:MISSING_TICKERS_LOG_LIMIT])
        if len(missing) > MISSING_TICKERS_LOG_LIMIT:
            msg += f" +{len(missing) - MISSING_TICKERS_LOG_LIMIT} more"
    if len(missing) <= MISSING_ROWS_TOLERANCE:
        print(f"  OK {msg}")
        return None
    print(f"  !! {msg}")
    return msg


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


class CorpAction(NamedTuple):
    """미처리 기업행위 1건 — 사건일 행의 기준가와 직전 저장 봉 [L, H]."""
    ticker: str
    date: date
    base: int
    prev_low: int
    prev_high: int


def scan_corp_actions(cursor) -> tuple[list[CorpAction], int]:
    """KIS_DAILY_LAST_DATE 이후 활성 종목 전 행 — is_outside_prev_range ∧ KNOWN_BASE_ADJ 밖인 행을
    최근 날짜순으로, KNOWN_BASE_ADJ 에 걸러진 건수와 함께. 기준가 NULL·직전 봉 없는 행은 제외.
    SQL 은 [L, H] 밖만 거르는 상위 집합 — 1틱 허용은 fetch_daily_close 의 판정 함수가 한다."""
    # 지연 import — fetch_daily_close·fetch_prices 가 이 모듈을 import 한다 (순환).
    from fetch_daily_close import is_outside_prev_range
    from fetch_prices import KIS_DAILY_LAST_DATE

    # 직전 봉: 창 안은 LAG, 종목별 창 첫 행(rn=1)만 LATERAL 로 창 밖 봉 — 행마다 LATERAL 은
    # 버퍼 접근이 ~10배 (29k행 실측 0.28s vs 0.08s).
    cursor.execute(
        """
        WITH x AS (
          SELECT d.ticker, d.date, d.base_price,
                 LAG(d.low)  OVER w AS prev_low,
                 LAG(d.high) OVER w AS prev_high,
                 ROW_NUMBER() OVER w AS rn
            FROM daily_prices d
            JOIN stocks s ON s.ticker = d.ticker AND s.is_active
           WHERE d.date > %s
          WINDOW w AS (PARTITION BY d.ticker ORDER BY d.date)
        )
        SELECT x.ticker, x.date, x.base_price,
               COALESCE(x.prev_low, p.low), COALESCE(x.prev_high, p.high)
          FROM x
          LEFT JOIN LATERAL (
               SELECT low, high FROM daily_prices
                WHERE ticker = x.ticker AND date < x.date AND x.rn = 1
                ORDER BY date DESC LIMIT 1
          ) p ON true
         WHERE x.base_price < COALESCE(x.prev_low, p.low)
            OR x.base_price > COALESCE(x.prev_high, p.high)
         ORDER BY x.date DESC, x.ticker
        """,
        (KIS_DAILY_LAST_DATE,),
    )
    found: list[CorpAction] = []
    known = 0
    for ticker, d, base, low, high in cursor.fetchall():
        if not is_outside_prev_range(base, low, high):
            continue
        if (ticker, d.isoformat()) in KNOWN_BASE_ADJ:
            known += 1
            continue
        found.append(CorpAction(ticker, d, base, low, high))
    return found, known


def check_corp_action_range(cursor) -> list[str]:
    """scan_corp_actions 의 미처리 건 → 실패 사유 (종목 · 날짜 · base · 직전 봉 [L, H])."""
    from fetch_prices import KIS_DAILY_LAST_DATE  # 지연 import — scan_corp_actions 와 같은 이유

    found, known = scan_corp_actions(cursor)
    scope = f"date > {KIS_DAILY_LAST_DATE}, known {known}"
    if not found:
        print(f"  OK corp action range: unprocessed 0 ({scope})")
        return []
    failures: list[str] = []
    for a in found[:CORP_ACTION_REPORT_LIMIT]:
        msg = f"{a.ticker} {a.date} base {a.base} vs prev [L {a.prev_low}, H {a.prev_high}]"
        print(f"  !! corp action unprocessed {msg}")
        failures.append(f"corp action unprocessed {msg}")
    if len(found) > CORP_ACTION_REPORT_LIMIT:
        total = (
            f"corp action unprocessed total {len(found)} "
            f"(showing latest {CORP_ACTION_REPORT_LIMIT}; {scope})"
        )
        print(f"  !! {total}")
        failures.append(total)
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

    missing_fail = check_missing_rows(cur, expected)
    if missing_fail:
        failures.append(missing_fail)
    idx_floor_fail = check_index_row_count_floor(cur, expected)
    if idx_floor_fail:
        failures.append(idx_floor_fail)
    failures.extend(check_domestic_intraday(cur, expected))
    failures.extend(check_corp_action_range(cur))
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
