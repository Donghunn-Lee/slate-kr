"""
감지된 기업행위의 2026-09-14 이후 구 스케일 행을 KIS 수정주가 축으로 rescale (Daily 반자동).

배경
  daily_prices 는 ≤ 2026-09-11 이 KIS 수정주가 축(backfill_prices_kis.py), 9/14 이후가 20:00
  캔들 축(fetch_daily_close.py)이라 병합·분할·권리락 뒤 9/14 ~ 사건 전날 행이 구 스케일로
  남는다. verify_daily_freshness 가 FAIL 로 올리는 미처리 건의 처리(재적재 + rescale)를 게이트를
  전부 통과한 건만 Daily 안에서 돌리고, 거절된 건은 web/sql/rescale_corporate_action.sql 로 수동.

대상
  verify_daily_freshness.scan_corp_actions 의 미처리 목록 그대로 — 인자 없음.

게이트 (전부 DB 쓰기 전. 하나라도 어긋나면 그 종목은 손대지 않는다)
  precheck  run 미처리 줄 ≤ MAX_EVENTS_PER_RUN(초과 시 전부 거절) · 종목당 미처리 줄 1개 ·
            RESCALE_FROM 줄 없음(재적재만 되고 rescale 안 된 반쪽 상태 신호) · 직전 봉 L·H > 0 ·
            사건일이 최근 RECENT_TRADING_DAYS 거래일 안
  decide    precheck + kis_adj="1" · 9/11 행 존재 · 구간 행 ≥ 1 ·
            f_pre(KIS 9/11 수정 종가 ÷ DB 9/11 close)가 1 이 아님(|f − 1| > F_TOLERANCE) ·
            f_reload(재적재 계획의 9/11 close 비) == f_pre(6자리) · 사건 비율 · 구간 close 한 축
  사건 비율  f ∈ [(base − 1틱)/H, (base + 1틱)/L]. 직전 봉 L = H(거래정지)면 |f ÷ (base/L) − 1| ≤ 1%.
            직전 close 는 20:00 종가라 애프터마켓 드리프트를 담는다 — 비율 대신 직전 봉 범위로 본다.
  한 축     [9/11 close] + 구간 close 의 인접 비 r 이 |ln r| > |ln f|/2(1 보다 f 쪽에 가까움)이면
            새 축 행이 섞인 것으로 본다 — 갭 채움(pykrx adjusted) 행의 ×f 이중 적용 방지.
            f 가 1 에 가까운 권리락은 평범한 등락도 걸려 수동으로 떨어질 수 있다.

적용 (apply_block — 종목마다 트랜잭션 1개)
  구간 행 · 9/11 행 SELECT … FOR UPDATE 가 계획과 같음 → ≤ 9/11 재적재 upsert(rowcount 일치) →
  구간 UPDATE(rowcount 일치) → 사후 1틱(사건일 · 구간 첫 행 두 이음매) → 원장
  corp_action_rescales INSERT → COMMIT. 아니면 ROLLBACK. 재적재와 rescale 이 한 트랜잭션이라
  반쪽 상태가 남지 않고, 원장 PK(ticker, event_date)가 같은 사건의 이중 적용을 막는다.

출력
  logs/corp_actions/<stamp>/ — <event>_rescale_<ticker>.sql · <ticker>_before.json · summary.json
  (Daily 가 artifact 로 올린다. 미처리 0건이면 만들지 않는다). stdout 은 종목마다
  OK rescaled <ticker> f=<f> rows=<n> / !! declined <ticker> — <사유>.
  --dry-run 은 SQL · summary 만 만들고 적용하지 않는다. 강제 적용 레버는 없다.

exit code
  0  미처리 0건 또는 전부 적용 (dry-run 은 전부 게이트 통과)
  1  거절 · 실패 1건 이상 — 그 종목은 미적용, 이어지는 verify 가 FAIL 로 올린다
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Sequence

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from backfill_prices_kis import F_TOLERANCE, UPSERT_VALUES_SQL, Shared, plan_one
from db import get_connection
from fetch_daily_close import classify_kis_adj, is_outside_prev_range, tick_size
from fetch_prices import KIS_DAILY_LAST_DATE, kis_daily_call, parse_bar
from kis_token import get_token
from log_setup import setup_logging
from verify_daily_freshness import (
    CorpAction,
    compute_expected,
    load_krx_calendar,
    scan_corp_actions,
)

load_dotenv()

KST = timezone(timedelta(hours=9))

logger = logging.getLogger(__name__)

# 20:00 축 첫 거래일(KIS_DAILY_LAST_DATE 다음 거래일). rescale 구간 = 이 날 ~ 사건 전날.
RESCALE_FROM = date(2026, 9, 14)
# run 당 미처리 줄 상한 — 넘으면 데이터 이상으로 보고 전부 수동. 주 1~3건이 보통이고, 한 번에
# 수십 건은 사건보다 KIS · 적재 쪽 이상 정황이다.
MAX_EVENTS_PER_RUN = 5
# 사건일 신선도 — 오래된 날짜에 새로 뜬 줄은 사건보다 과거 행 재기록 정황.
RECENT_TRADING_DAYS = 5
# 거래정지(직전 봉 L = H) 사건 비율 허용치.
FLAT_RATIO_TOLERANCE = 0.01
# render_update 가 SQL 리터럴로 넣는 티커 — 따옴표가 섞일 수 없는 형식만 통과.
TICKER_RE = re.compile(r"^[0-9A-Z]{6}$")
OUT_ROOT = os.path.join(os.path.dirname(__file__), "logs", "corp_actions")

PREV_BAR_SQL = (
    "SELECT date, close FROM daily_prices WHERE ticker = %s AND date < %s "
    "ORDER BY date DESC LIMIT 1"
)
RANGE_SQL = (
    "SELECT date, open, high, low, close, volume, base_price FROM daily_prices "
    "WHERE ticker = %s AND date >= %s AND date < %s ORDER BY date"
)
CLOSE_911_SQL = "SELECT close FROM daily_prices WHERE ticker = %s AND date = %s"
# 사후 1틱 — 그 날 기준가와 직전 저장 봉 [L, H] (verify 스캔과 같은 비교).
SEAM_SQL = """
    SELECT d.base_price, p.low, p.high
      FROM daily_prices d
      LEFT JOIN LATERAL (
           SELECT low, high FROM daily_prices
            WHERE ticker = d.ticker AND date < d.date
            ORDER BY date DESC LIMIT 1
      ) p ON true
     WHERE d.ticker = %s AND d.date = %s
"""
LEDGER_INSERT_SQL = """
    INSERT INTO corp_action_rescales
        (ticker, event_date, factor, kis_adj, rows_updated, sql, run_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""
FILE_HEADER = """\
-- rescale_corp_actions.py 생성 · {stamp} · run {run}
-- 템플릿: rescale_corporate_action.sql. factor = 재적재 후 9/11 close ÷ 재적재 전 9/11 close.
-- 자동 적용은 ≤ 2026-09-11 재적재 upsert 와 아래 UPDATE 를 한 트랜잭션으로 묶는다 — 적용 여부는
--   summary.json · corp_action_rescales. 손으로 돌릴 때는 backfill_prices_kis.py --tickers 를 먼저.

"""


@dataclass(frozen=True)
class Event:
    """종목 1개의 처리 단위 — action 은 그 종목의 최근 미처리 줄(RESCALE_FROM 줄 제외)."""

    action: CorpAction
    ticker_lines: int  # 이 종목의 미처리 줄 수
    seam_line: bool  # RESCALE_FROM 줄 존재
    recent: bool  # 사건일이 최근 RECENT_TRADING_DAYS 거래일 안
    run_lines: int  # 이번 run 의 미처리 줄 총수


@dataclass(frozen=True)
class RangeStats:
    """rescale 구간(RESCALE_FROM ≤ date < 사건일)과 9/11 행의 계획 시점 상태."""

    rows: int
    first_date: date | None
    last_date: date | None
    min_close: int | None
    max_close: int | None
    first_close: int | None
    traded_rows: int  # volume > 0 — 있으면 volume ÷f
    close_911: int | None
    closes: tuple[int, ...]


@dataclass(frozen=True)
class Block:
    """rescale 1건 — render_sql 의 입력이자 apply_block 의 적용 단위."""

    ticker: str
    name: str
    event_date: date
    factor: float
    kis_adj: str
    stats: RangeStats
    new_close_911: int
    reload_rows: tuple[tuple, ...] = ()  # backfill_prices_kis.plan_one 의 upsert 행


# ── 순수 함수 ─────────────────────────────────────────────────────────
def compute_factor(old: int, new: int) -> float:
    """재적재 전 → 후 9/11 close 비, 6자리 (web/sql rescale 선례의 factor 정의)."""
    return round(new / old, 6)


def format_factor(f: float) -> str:
    """SQL 리터럴 — 6자리에서 끝 0 을 떼고, 정수면 .0 을 남긴다 (bigint/integer 정수 나눗셈 방지)."""
    s = f"{f:.6f}".rstrip("0")
    return s + "0" if s.endswith(".") else s


def recent_cutoff(today: date, calendar: dict[date, bool]) -> date:
    """today 이전(포함) 최근 RECENT_TRADING_DAYS 거래일의 첫날."""
    d = compute_expected(today, calendar)
    for _ in range(RECENT_TRADING_DAYS - 1):
        d = compute_expected(d - timedelta(days=1), calendar)
    return d


def build_events(actions: list[CorpAction], cutoff: date) -> list[Event]:
    """scan_corp_actions 목록(최근 날짜순) → 종목별 Event (최근 사건 종목부터)."""
    by_ticker: dict[str, list[CorpAction]] = {}
    for a in actions:
        by_ticker.setdefault(a.ticker, []).append(a)
    events = []
    for lines in by_ticker.values():
        rest = [a for a in lines if a.date != RESCALE_FROM]
        action = rest[0] if rest else lines[0]
        events.append(
            Event(
                action=action,
                ticker_lines=len(lines),
                seam_line=len(rest) < len(lines),
                recent=action.date >= cutoff,
                run_lines=len(actions),
            )
        )
    return events


def range_stats(rows: Sequence[tuple], close_911: int | None) -> RangeStats:
    """구간 행 (date, open, high, low, close, volume, base_price) 날짜순 → RangeStats."""
    closes = tuple(r[4] for r in rows)
    return RangeStats(
        rows=len(rows),
        first_date=rows[0][0] if rows else None,
        last_date=rows[-1][0] if rows else None,
        min_close=min(closes, default=None),
        max_close=max(closes, default=None),
        first_close=closes[0] if closes else None,
        traded_rows=sum(1 for r in rows if r[5] > 0),
        close_911=close_911,
        closes=closes,
    )


def is_event_ratio_ok(f: float, base: int, prev_low: int, prev_high: int) -> bool:
    """f 가 사건일 기준가 ÷ 직전 봉과 맞는지 — [(base − 1틱)/H, (base + 1틱)/L],
    거래정지(L = H)면 base/L 의 ±FLAT_RATIO_TOLERANCE."""
    if prev_low == prev_high:
        return abs(f * prev_low / base - 1) <= FLAT_RATIO_TOLERANCE
    tick = tick_size(base)
    return (base - tick) / prev_high <= f <= (base + tick) / prev_low


def count_axis_jumps(closes: Sequence[int], f: float) -> int:
    """인접 close 비 r 이 1 보다 f(또는 1/f) 쪽에 가까운(|ln r| > |ln f|/2) 횟수. 0 이하 close 도 센다."""
    half = abs(math.log(f)) / 2
    return sum(
        1
        for a, b in zip(closes, closes[1:])
        if a <= 0 or b <= 0 or abs(math.log(b / a)) > half
    )


def precheck(event: Event) -> list[str]:
    """KIS · DB 조회 없이 정해지는 거절 사유."""
    a = event.action
    reasons = []
    if event.run_lines > MAX_EVENTS_PER_RUN:
        reasons.append(f"run 미처리 {event.run_lines}줄 > {MAX_EVENTS_PER_RUN}")
    if event.ticker_lines > 1:
        reasons.append(f"종목 미처리 줄 {event.ticker_lines}개")
    if event.seam_line:
        reasons.append(f"{RESCALE_FROM} 줄 — 재적재만 된 반쪽 상태")
    if a.prev_low <= 0 or a.prev_high <= 0:
        reasons.append(f"직전 봉 L·H 0 [L {a.prev_low}, H {a.prev_high}]")
    if not event.recent:
        reasons.append(f"사건일 {a.date} 최근 {RECENT_TRADING_DAYS}거래일 밖")
    if not TICKER_RE.match(a.ticker):
        reasons.append(f"티커 형식 {a.ticker!r}")
    return reasons


def decide(
    event: Event,
    kis_adj: str,
    f_pre: float | None,
    f_reload: float | None,
    stats: RangeStats,
) -> tuple[bool, list[str]]:
    """적용 여부와 거절 사유 전부. 사유가 하나라도 있으면 적용하지 않는다."""
    a = event.action
    reasons = precheck(event)
    if kis_adj != "1":
        reasons.append(f"kis_adj={kis_adj}")
    if stats.close_911 is None:
        reasons.append(f"{KIS_DAILY_LAST_DATE} 행 없음")
    if stats.rows == 0:
        reasons.append("rescale 구간 행 0")
    if f_pre is None:
        reasons.append("f_pre 없음 (KIS 9/11 봉)")
        return False, reasons
    if abs(f_pre - 1) <= F_TOLERANCE:
        reasons.append(f"f_pre={f_pre} ≈ 1 (KIS 미조정)")
        return False, reasons
    if f_reload is None:
        reasons.append("f_reload 없음 (재적재 계획)")
    elif f_reload != f_pre:
        reasons.append(f"f_reload={f_reload} ≠ f_pre={f_pre}")
    if a.prev_low > 0 and a.prev_high > 0 and not is_event_ratio_ok(
        f_pre, a.base, a.prev_low, a.prev_high
    ):
        reasons.append(
            f"사건 비율 밖 (f={f_pre}, base {a.base} vs [L {a.prev_low}, H {a.prev_high}])"
        )
    series = ((stats.close_911,) if stats.close_911 else ()) + stats.closes
    jumps = count_axis_jumps(series, f_pre)
    if jumps:
        reasons.append(f"구간 축 혼재 (인접 비 점프 {jumps})")
    return not reasons, reasons


def render_update(block: Block) -> str:
    f = format_factor(block.factor)
    cols = ["open", "high", "low", "close", "base_price"]
    sets = [f"{c:<10} = ROUND({c:<10} * {f})" for c in cols]
    if block.stats.traded_rows:
        sets.append(f"{'volume':<10} = ROUND({'volume':<10} / {f})")
    body = ",\n    ".join(sets)
    return (
        "UPDATE daily_prices\n"
        f"SET {body}\n"
        f"WHERE ticker = '{block.ticker}'\n"
        f"  AND date >= '{RESCALE_FROM}'\n"
        f"  AND date < '{block.event_date}';"
    )


def render_select(block: Block) -> str:
    return (
        "SELECT count(*) AS rows_to_rescale, min(date) AS first_date, max(date) AS last_date,\n"
        "       min(close) AS min_close, max(close) AS max_close\n"
        "FROM daily_prices\n"
        f"WHERE ticker = '{block.ticker}'\n"
        f"  AND date >= '{RESCALE_FROM}'\n"
        f"  AND date < '{block.event_date}';"
    )


def render_sql(block: Block) -> str:
    """web/sql rescale 선례(2026-10-14_rescale_033340.sql)와 같은 블록 — 머리 주석 · 검증
    SELECT · BEGIN/UPDATE/COMMIT. 원장 sql 열과 web/sql 커밋 파일에 그대로 쓴다."""
    s = block.stats
    f = format_factor(block.factor)
    if s.traded_rows:
        volume_note = f"-- volume ÷factor 포함 — 구간 실거래 {s.traded_rows}행"
    else:
        volume_note = "-- volume ÷factor 미포함 — 구간 전 행 volume 0 (거래정지)"
    span = f"{s.first_date} ~ {s.last_date}"
    lines = [
        f"-- ══ {block.ticker} {block.name} · event {block.event_date} ══",
        f"-- 구간 {span} · {s.rows}행 · factor {f} "
        f"(9/11 close {s.close_911} → {block.new_close_911})",
        volume_note,
        f"-- 검증 기대: rows_to_rescale {s.rows} · {span} · close {s.min_close} ~ {s.max_close}",
        render_select(block),
        "",
        "BEGIN;",
        "",
        render_update(block),
        f"-- 예상 UPDATE 카운트: {s.rows}",
        "",
        "COMMIT;",
    ]
    return "\n".join(lines) + "\n"


# ── 적용 ─────────────────────────────────────────────────────────────
def _rollback(conn, reason: str) -> tuple[bool, str]:
    conn.rollback()
    return False, reason


def apply_block(conn, block: Block, run_id: str | None) -> tuple[bool, str]:
    """트랜잭션 1개로 적용 → (적용 여부, 요약 또는 거절 사유). 대조 · rowcount · 사후 1틱이
    어긋나면 ROLLBACK 후 (False, 사유). 예외는 ROLLBACK 후 그대로 올린다."""
    s = block.stats
    cur = conn.cursor()
    try:
        cur.execute(
            RANGE_SQL + " FOR UPDATE", (block.ticker, RESCALE_FROM, block.event_date)
        )
        rows = cur.fetchall()
        cur.execute(CLOSE_911_SQL + " FOR UPDATE", (block.ticker, KIS_DAILY_LAST_DATE))
        row_911 = cur.fetchone()
        now = range_stats(rows, row_911[0] if row_911 else None)
        if now != s:
            return _rollback(
                conn,
                f"계획 대조 불일치 (rows {now.rows}/{s.rows}, "
                f"9/11 close {now.close_911}/{s.close_911})",
            )
        n_reload = len(block.reload_rows)
        if n_reload:
            execute_values(cur, UPSERT_VALUES_SQL, block.reload_rows, page_size=n_reload)
            if cur.rowcount != n_reload:
                return _rollback(conn, f"재적재 upsert {cur.rowcount} ≠ {n_reload}")
        cur.execute(render_update(block))
        if cur.rowcount != s.rows:
            return _rollback(conn, f"UPDATE {cur.rowcount} ≠ {s.rows}")
        for label, d in (("사건일", block.event_date), ("구간 첫 행", s.first_date)):
            cur.execute(SEAM_SQL, (block.ticker, d))
            seam = cur.fetchone()
            if seam is None:
                return _rollback(conn, f"사후 검사 — {label} {d} 행 없음")
            if is_outside_prev_range(*seam):
                return _rollback(
                    conn,
                    f"사후 1틱 이탈 — {label} {d} base {seam[0]} vs [L {seam[1]}, H {seam[2]}]",
                )
        cur.execute(
            LEDGER_INSERT_SQL,
            (
                block.ticker,
                block.event_date,
                Decimal(format_factor(block.factor)),
                block.kis_adj,
                s.rows,
                render_sql(block),
                run_id,
            ),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
    return True, f"rows={s.rows} reload={n_reload}"


# ── 오케스트레이션 (DB 읽기 · KIS) ────────────────────────────────────
def fetch_kis_close_911(token: str, ticker: str) -> int | None:
    """KIS 9/11 수정 종가 1콜 — f_pre 분자. 콜 실패 · 봉 부재면 None."""
    d = KIS_DAILY_LAST_DATE
    ymd = d.strftime("%Y%m%d")
    raw = kis_daily_call(token, ticker, ymd, ymd)
    if raw is None:
        return None
    last_iso = (d - timedelta(days=1)).isoformat()
    bars = [p for p in (parse_bar(r, d.isoformat(), last_iso) for r in raw) if p]
    return bars[0][4] if bars else None


def _dump(path: str, obj) -> None:
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(obj, fp, ensure_ascii=False, indent=1, default=str)


def process_event(
    conn,
    token: str,
    sh: Shared,
    ev: Event,
    out_dir: str,
    header: str,
    dry_run: bool,
    run_id: str | None,
) -> dict:
    """종목 1건 — 게이트 → (통과 시) 적용. summary 항목 dict 반환."""
    a = ev.action
    entry: dict = {
        "ticker": a.ticker,
        "event_date": a.date.isoformat(),
        "base": a.base,
        "prev_low": a.prev_low,
        "prev_high": a.prev_high,
    }
    reasons = precheck(ev)
    if reasons:
        entry.update(status="declined", reasons=reasons)
        return entry

    cur = conn.cursor()
    try:
        cur.execute(PREV_BAR_SQL, (a.ticker, a.date))
        prev_date, prev_close = cur.fetchone()
        cur.execute("SELECT name FROM stocks WHERE ticker = %s", (a.ticker,))
        name = cur.fetchone()[0]
        cur.execute(RANGE_SQL, (a.ticker, RESCALE_FROM, a.date))
        rows = cur.fetchall()
        cur.execute(CLOSE_911_SQL, (a.ticker, KIS_DAILY_LAST_DATE))
        row_911 = cur.fetchone()
        conn.commit()
        stats = range_stats(rows, row_911[0] if row_911 else None)

        kis_adj, kis_prev_close, kis_reason = classify_kis_adj(
            token, a.ticker, prev_date, a.date, prev_close, a.base
        )
        kis_911 = fetch_kis_close_911(token, a.ticker)
        f_pre = compute_factor(stats.close_911, kis_911) if stats.close_911 and kis_911 else None
        plan, reload_rows, existing = plan_one(conn, cur, sh, a.ticker)
    finally:
        cur.close()
    f_reload = None
    if plan["status"] == "ok" and plan["old_close_end"] and plan["new_close_end"]:
        f_reload = compute_factor(plan["old_close_end"], plan["new_close_end"])
    ok, reasons = decide(ev, kis_adj, f_pre, f_reload, stats)
    entry.update(
        name=name,
        kis_adj=kis_adj,
        kis_prev_close=kis_prev_close,
        kis_reason=kis_reason,
        f_pre=f_pre,
        f_reload=f_reload,
        plan_status=plan["status"],
        rows=stats.rows,
        traded_rows=stats.traded_rows,
        reload_rows=len(reload_rows),
    )

    factor = f_pre if f_pre is not None else f_reload
    new_911 = kis_911 if kis_911 is not None else plan.get("new_close_end")
    block = None
    if factor is not None and new_911 and stats.rows and stats.close_911:
        block = Block(a.ticker, name, a.date, factor, kis_adj, stats, new_911, tuple(reload_rows))
        sql_file = f"{a.date}_rescale_{a.ticker}.sql"
        with open(os.path.join(out_dir, sql_file), "w", encoding="utf-8") as fp:
            fp.write(header + render_sql(block))
        entry["sql_file"] = sql_file
        _dump(
            os.path.join(out_dir, f"{a.ticker}_before.json"),
            {
                "ticker": a.ticker,
                "event_date": a.date,
                "close_911": stats.close_911,
                "range_rows": rows,
                "reload_before": {r[1]: existing.get(r[1]) for r in reload_rows},
            },
        )

    if not ok or block is None:
        entry.update(status="declined", reasons=reasons or ["SQL 생성 불가"])
        return entry
    if dry_run:
        entry["status"] = "would_apply"
        return entry
    applied, detail = apply_block(conn, block, run_id)
    entry["status"] = "applied" if applied else "declined"
    if applied:
        entry["detail"] = detail
    else:
        entry["reasons"] = [detail]
    return entry


def report_line(entry: dict) -> str:
    status = entry["status"]
    f = entry.get("f_pre")
    f_txt = format_factor(f) if f is not None else "?"
    if status == "applied":
        return f"OK rescaled {entry['ticker']} f={f_txt} rows={entry['rows']}"
    if status == "would_apply":
        return f"-- dry-run {entry['ticker']} f={f_txt} rows={entry['rows']} (적용 안 함)"
    return f"!! declined {entry['ticker']} — {'; '.join(entry['reasons'])}"


def main() -> int:
    setup_logging("rescale_corp_actions")
    parser = argparse.ArgumentParser(description="감지된 기업행위 rescale (Daily 반자동)")
    parser.add_argument(
        "--dry-run", action="store_true", help="SQL · summary 만 만들고 적용하지 않는다"
    )
    args = parser.parse_args()
    if not os.getenv("KIS_APP_KEY") or not os.getenv("KIS_APP_SECRET"):
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정 (collector/.env)")
        return 1
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        return 1

    now_kst = datetime.now(KST)
    run_id = os.getenv("GITHUB_RUN_ID")
    entries: list[dict] = []
    conn = get_connection()
    try:
        calendar = load_krx_calendar(conn)
        cur = conn.cursor()
        actions, known = scan_corp_actions(cur)
        cur.close()
        conn.commit()
        if not actions:
            print(f"OK corp actions: unprocessed 0 (known {known})")
            return 0

        events = build_events(actions, recent_cutoff(now_kst.date(), calendar))
        stamp = now_kst.strftime("%Y%m%d_%H%M%S")
        out_dir = os.path.join(OUT_ROOT, stamp)
        os.makedirs(out_dir, exist_ok=True)
        header = FILE_HEADER.format(stamp=stamp, run=run_id or "local")
        token = get_token(conn) if any(not precheck(ev) for ev in events) else ""
        sh = Shared(token, len(events))
        for ev in events:
            try:
                entry = process_event(
                    conn, token, sh, ev, out_dir, header, args.dry_run, run_id
                )
            except Exception as e:
                conn.rollback()
                logger.exception("[%s] 처리 실패", ev.action.ticker)
                entry = {
                    "ticker": ev.action.ticker,
                    "event_date": ev.action.date.isoformat(),
                    "status": "error",
                    "reasons": [f"예외 {e!r}"],
                }
            entries.append(entry)
            print(report_line(entry))
        _dump(
            os.path.join(out_dir, "summary.json"),
            {
                "started_at": now_kst.isoformat(),
                "run_id": run_id,
                "dry_run": args.dry_run,
                "unprocessed_lines": len(actions),
                "known": known,
                "events": entries,
            },
        )
        logger.info("summary → %s", out_dir)
    finally:
        conn.close()
    return 0 if all(e["status"] in ("applied", "would_apply") for e in entries) else 1


if __name__ == "__main__":
    sys.exit(main())
