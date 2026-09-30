"""
KRX 일별매매정보 LIST_SHRS(상장주식수) → stocks.shares 동기화 + bps 재계산.

용도
  시가총액(shares × 종가)과 bps(지배주주지분 ÷ shares)의 주식 수. DART 사업보고서
  발행주식총수는 연 1회 기준이라 병합·분할·소각이 최대 1년 넘게 반영되지 않고, 신규 상장은
  첫 사업보고서 전까지 비어 있었다(F91). KRX 는 매 거래일 활성 종목 전부를 게시한다.

호출 (실행당 2회)
  sto/stk_bydd_trd (유가) · sto/ksq_bydd_trd (코스닥). basDd = fetch_stocks 와 같은 직전 거래일.

적재
  값이 바뀐 활성 종목만 배치 UPDATE → fetch_financials.sync_bps 로 bps 를 새 shares 에 맞춘 뒤
  한 트랜잭션으로 commit (시총과 PBR 이 서로 다른 주식 수를 보는 창을 없앤다).

가드
  · 비거래일: KRX 호출 전 정상 종료
  · 호출 실패 또는 응답 행 < MIN_ROWS: 쓰기 없이 exit 1
  · LIST_SHRS ≤ 0·파싱 불가: 그 종목만 skip + 로그
  · 응답에 없는 활성 종목: 기존 값 유지 + 목록 로그
  · 값 상한·변동폭 가드 없음 — 병합이면 1/10 도 정상. 2배 이상·0.5배 이하 변화만 WARN
"""

import logging
import os
import sys
from datetime import datetime
from typing import NamedTuple, Optional

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from backfill_index_prices import krx_call
from db import get_connection
from fetch_financials import sync_bps
from fetch_stocks import KST, get_latest_biz_date
from log_setup import setup_logging
from verify_daily_freshness import is_trading_day

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
logger = logging.getLogger(__name__)

KRX_PATHS = ("sto/stk_bydd_trd", "sto/ksq_bydd_trd")
# fetch_stocks.MIN_COLLECTED 와 같은 하한 — 유가(~940)·코스닥(~1,820) 중 한쪽만 와도 걸린다.
MIN_ROWS = 2000
BIG_MOVE_RATIO = 2.0
UPDATE_PAGE_SIZE = 500


class SharesPlan(NamedTuple):
    updates: list[tuple[str, int]]  # (ticker, new_shares)
    invalid: list[tuple[str, str]]  # (ticker, raw LIST_SHRS)
    missing: list[str]  # 응답에 없는 활성 종목
    big_moves: list[tuple[str, int, int, float]]  # (ticker, old, new, new/old)


def parse_list_shrs(raw) -> Optional[int]:
    """LIST_SHRS 문자열 → 양의 정수. 0 이하·파싱 불가는 None."""
    try:
        val = int(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return val if val > 0 else None


def fetch_krx_rows(bas_dd: str) -> Optional[list[dict]]:
    """유가·코스닥 합산 행. 한 endpoint 라도 호출 실패면 None."""
    rows: list[dict] = []
    for path in KRX_PATHS:
        got = krx_call(path, bas_dd)
        if got is None:
            return None
        logger.info("응답 %s 행수=%d", path, len(got))
        rows.extend(got)
    return rows


def plan_updates(krx_rows: list[dict], current: dict[str, Optional[int]]) -> SharesPlan:
    """current = 활성 종목 {ticker: 현재 shares}. 활성이 아닌 응답 행(우선주 등)은 무시."""
    updates, invalid, big_moves = [], [], []
    seen: set[str] = set()
    for row in krx_rows:
        ticker = (row.get("ISU_CD") or "").strip()
        if ticker not in current:
            continue
        seen.add(ticker)
        new = parse_list_shrs(row.get("LIST_SHRS"))
        if new is None:
            invalid.append((ticker, row.get("LIST_SHRS")))
            continue
        old = current[ticker]
        if new == old:
            continue
        updates.append((ticker, new))
        if old and old > 0:
            ratio = new / old
            if ratio >= BIG_MOVE_RATIO or ratio <= 1 / BIG_MOVE_RATIO:
                big_moves.append((ticker, old, new, ratio))
    missing = sorted(set(current) - seen)
    return SharesPlan(updates, invalid, missing, big_moves)


def apply_updates(cursor, updates: list[tuple[str, int]]) -> None:
    if not updates:
        return
    execute_values(
        cursor,
        "UPDATE stocks AS s SET shares = v.shares "
        "FROM (VALUES %s) AS v(ticker, shares) WHERE s.ticker = v.ticker",
        updates,
        page_size=UPDATE_PAGE_SIZE,
    )


def main():
    setup_logging("shares")
    if not os.getenv("KRX_OPEN_API_KEY"):
        logger.error("KRX_OPEN_API_KEY 미설정 (collector/.env)")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        sys.exit(1)

    # daily 체인은 비거래일에도 트리거되지만 KRX 는 영업일에만 게시한다.
    today = datetime.now(KST).date()
    if not is_trading_day(today):
        logger.info(
            "gate closed — non-trading day (%s). skip 후 정상 종료.", today.isoformat()
        )
        return

    bas_dd = get_latest_biz_date()
    logger.info("기준일자 basDd=%s", bas_dd)
    rows = fetch_krx_rows(bas_dd)
    if rows is None:
        logger.error("KRX 호출 실패 — 쓰기 없이 종료")
        sys.exit(1)
    if len(rows) < MIN_ROWS:
        logger.error(
            "KRX 응답 %d행 < 하한 %d — basDd=%s 미게시·부분 실패 정황, 쓰기 없이 종료",
            len(rows), MIN_ROWS, bas_dd,
        )
        sys.exit(1)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT ticker, shares FROM stocks WHERE is_active = true")
        current = dict(cursor.fetchall())
        plan = plan_updates(rows, current)

        for ticker, raw in plan.invalid:
            logger.warning("LIST_SHRS 무효 skip ticker=%s raw=%r", ticker, raw)
        if plan.missing:
            logger.warning(
                "KRX 응답에 없는 활성 종목 %d개 — 기존 값 유지: %s",
                len(plan.missing), ", ".join(plan.missing),
            )
        for ticker, old, new, ratio in plan.big_moves:
            logger.warning(
                "[SHARES_BIG_MOVE] ticker=%s old=%s new=%s ratio=%.4f",
                ticker, f"{old:,}", f"{new:,}", ratio,
            )

        apply_updates(cursor, plan.updates)
        bps_rows = sync_bps(cursor)
        conn.commit()
    except Exception as e:
        logger.error("DB 갱신 실패 — rollback: %s", e)
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

    filled = sum(1 for t, _ in plan.updates if not current.get(t))
    logger.info(
        "완료: 응답=%d, 활성=%d, shares 변경=%d (NULL·0→값 %d, 2배·0.5배 밖 변동 %d), "
        "무효 skip=%d, 응답 부재=%d, bps 갱신=%d행",
        len(rows), len(current), len(plan.updates), filled, len(plan.big_moves),
        len(plan.invalid), len(plan.missing), bps_rows,
    )


if __name__ == "__main__":
    main()
