"""
KIS 일봉(수정주가) → daily_prices 전면 재적재 (date <= 2026-09-11, idempotent upsert).

배경 (#162 F89)
  초기 백필 이후의 기업행위(감자·분할·병합 등)가 DB 히스토리에 반영되지 않는 구조 —
  증분 로더(fetch_prices.py)는 fetch 창만 upsert 하고, fetch_daily_close.py(20:00 축)는
  수정 개념이 없다. probe(#162) 결과 이상치 892종목 중 다수가 KIS 수정주가 대비
  스케일 계수 f≠1. 이 스크립트는 종목별 DB 최초 봉 ~ 2026-09-11 구간을 KIS
  수정주가로 덮어쓴다. 9/14 이후 행(20:00 축)은 절대 건드리지 않는다.
  KIS 수정주가 모드는 volume 도 역보정한다(분할 ×N / 병합 ÷N) — 거래대금 불변이라 수용.

범위
  end = KIS_DAILY_LAST_DATE(2026-09-11) 고정, 인자 없음. parse_bar 의 end 초과 drop 에
  더해 스크립트에서도 assert 로 이중 방어.
  start = 종목별 DB MIN(date). 히스토리 확장 없음 — DB 행이 없는 종목은 skip.

페이징
  d1 = start 고정, d2 = end 에서 시작. 응답 최소 date − 1일을 다음 d2 로. 응답이 비거나
  최소 date <= start 면 종료. 1콜 100 트레이딩봉 상한(probe #098).

적재
  기존 행을 SELECT 해 두고 KIS 봉과 비교, 다른 행·없는 행만 execute_values 로 upsert
  (동일 행 재기록 없음 → 변경 행 수 = 실제 upsert 행 수). 컬럼 집합은
  fetch_prices.UPSERT_SQL 그대로 (open/high/low/close/volume — base_price·market_cap 미포함).
  volume 은 KIS 응답값 그대로 (≤ 9/11 구간 단일 소스).

병렬
  WORKERS 개 스레드가 큐에서 종목을 꺼내 처리 (정적 분할 없음). 워커별 DB 커넥션,
  BATCH_SIZE 종목마다 교체. 콜 간격은 전역 스로틀 MAX_CALLS_PER_SEC(합산) + 워커별
  fetch_prices.CALL_GAP_SEC(0.07s, EGW00201 20/s) 이중.

토큰
  시작 시 1회 TTL 확인 — 잔여 < TOKEN_MIN_TTL_MS(2h) 면 KIS_TOKEN_FORCE_ISSUE=1 로
  재발급 후 시작. 워커는 발급하지 않는다 (동시 발급 시 서로 무효화) — 재시도 전에
  DB kis_token 재조회만.

재시도
  kis_daily_call 실패(None — EGW00201·HTTP 5xx·토큰 만료 등, 래퍼가 구분하지 않음)는
  1s·2s·4s backoff 3회. 3회 실패 시 종목 실패로 기록하고 다음 종목. 워커 합산 연속
  MAX_CONSECUTIVE_FAIL 종목 실패 시 전체 중단.

관측 (삭제·수정 없음, 보고만)
  f = 신규 close(end) / 기존 close(end). |f − 1| > 0.005 면 기록 (= 9/11 이후 기업행위,
  9/14 이후 행 스케일 조정 후보).
  KIS 최초 봉 > DB 최초 봉 이면 기록 (KIS 에 없는 DB 선행 행은 유지).

사용
  python backfill_prices_kis.py                       # is_active = true 전 종목
  python backfill_prices_kis.py --tickers 005930,000660
  로그 logs/prices_backfill_kis_{YYYYMMDD}.log
  결과 JSON logs/prices_backfill_kis_{YYYYMMDD_HHMMSS}.json (종목별 통계)

규약: fetch_prices.py / backfill_prices.py 와 동일 (psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / 종목별 에러 격리 / per-batch 커넥션 교체).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import queue
import sys
import threading
import time
from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from psycopg2.extras import execute_values

import fetch_prices
from db import get_connection
from fetch_prices import KIS_DAILY_LAST_DATE, UPSERT_SQL, kis_daily_call, parse_bar
from kis_token import get_token
from log_setup import setup_logging

load_dotenv()

# ── 로깅 ──────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_stamp = datetime.today()
_report_file = os.path.join(
    _log_dir, f"prices_backfill_kis_{_stamp.strftime('%Y%m%d_%H%M%S')}.json"
)

logger = logging.getLogger(__name__)

END = KIS_DAILY_LAST_DATE
WORKERS = 3
BATCH_SIZE = 200
UPSERT_PAGE_SIZE = 500
# 합산 상한 10콜/s — 14콜/s 는 3워커 실측에서 EGW00201 이 나와 낮춤. 워커별 간격은
# fetch_prices.CALL_GAP_SEC — kis_daily_call 이 모듈 전역을 호출 시점에 읽는다.
MAX_CALLS_PER_SEC = 10
CALL_GAP_SEC = 0.07
RETRY_BACKOFF_SEC = (1, 2, 4)
MAX_CONSECUTIVE_FAIL = 5
TOKEN_REREAD_EVERY = 100
TOKEN_MIN_TTL_MS = 2 * 60 * 60 * 1000
F_TOLERANCE = 0.005
PROGRESS_EVERY = 100
# 페이징 방어 상한. 3,100봉 ≈ 31콜, 여유 5배.
MAX_PAGES_PER_TICKER = 160

fetch_prices.CALL_GAP_SEC = CALL_GAP_SEC

# fetch_prices.UPSERT_SQL 의 VALUES 절만 execute_values 형태로 치환 — 컬럼 집합은
# 단일 출처 유지 (base_price 미포함).
UPSERT_VALUES_SQL = UPSERT_SQL.replace(
    "VALUES (%s, %s, %s, %s, %s, %s, %s)", "VALUES %s"
)
assert UPSERT_VALUES_SQL != UPSERT_SQL, "fetch_prices.UPSERT_SQL VALUES 절 형태 변경됨"


class Throttle:
    """전역 콜 간격 스로틀 — 워커 합산 MAX_CALLS_PER_SEC 이하."""

    def __init__(self, per_sec: float):
        self.interval = 1.0 / per_sec
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            if now < self.next_at:
                time.sleep(self.next_at - now)
                now = self.next_at
            self.next_at = now + self.interval


class Shared:
    """워커 공유 상태. token/calls/연속 실패/결과는 lock 아래에서만."""

    def __init__(self, token: str, total: int):
        self.lock = threading.Lock()
        self.token = token
        self.calls = 0
        self.total = total
        self.done = 0
        self.ok = self.skip = self.empty = self.error = 0
        self.upserted = 0
        self.consecutive_fail = 0
        self.results: list[dict] = []
        self.abort = threading.Event()
        self.throttle = Throttle(MAX_CALLS_PER_SEC)
        self.started = time.monotonic()


def get_all_active_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true ORDER BY ticker")
    return [r[0] for r in cursor.fetchall()]


# ── 토큰 ─────────────────────────────────────────────────
def read_db_token(conn) -> tuple[str | None, int | None]:
    """kis_token 최신행 (access_token, expires_at_ms). 발급 없음."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT access_token, expires_at_ms FROM kis_token "
            "ORDER BY updated_at DESC LIMIT 1"
        )
        row = cur.fetchone()
    finally:
        cur.close()
    conn.commit()
    if row is None or not row[0]:
        return None, None
    return row[0], int(row[1]) if row[1] else None


def prepare_token(conn) -> str:
    """시작 시 1회: 잔여 TTL < TOKEN_MIN_TTL_MS 면 강제 재발급. 런 중 발급은 없다."""
    _, expires_at_ms = read_db_token(conn)
    remain_ms = (
        expires_at_ms - int(time.time() * 1000) if expires_at_ms is not None else -1
    )
    if remain_ms < TOKEN_MIN_TTL_MS:
        logger.info(
            "kis_token 잔여 %.1fh < %.0fh — 시작 전 강제 재발급",
            remain_ms / 3_600_000,
            TOKEN_MIN_TTL_MS / 3_600_000,
        )
        os.environ["KIS_TOKEN_FORCE_ISSUE"] = "1"
        try:
            return get_token(conn)
        finally:
            os.environ.pop("KIS_TOKEN_FORCE_ISSUE", None)
    return get_token(conn)


# ── KIS 호출 ──────────────────────────────────────────────
def call_with_retry(sh: Shared, conn, ticker: str, d1: str, d2: str) -> list | None:
    """kis_daily_call + backoff. 첫 재시도 전 DB 토큰 재조회(발급 없음). 콜 수는 sh.calls 누계."""
    for attempt in range(len(RETRY_BACKOFF_SEC) + 1):
        sh.throttle.wait()
        with sh.lock:
            sh.calls += 1
            token = sh.token
        bars = kis_daily_call(token, ticker, d1, d2)
        if bars is not None:
            return bars
        if attempt == len(RETRY_BACKOFF_SEC):
            return None
        if attempt == 0:
            db_token, _ = read_db_token(conn)
            if db_token:
                with sh.lock:
                    sh.token = db_token
        wait = RETRY_BACKOFF_SEC[attempt]
        logger.warning(
            "[%s] KIS 실패 [%s~%s] — %ds 후 재시도 (%d/%d)",
            ticker,
            d1,
            d2,
            wait,
            attempt + 1,
            len(RETRY_BACKOFF_SEC),
        )
        time.sleep(wait)
    return None


def fetch_kis_bars(
    sh: Shared, conn, ticker: str, start: date
) -> tuple[dict[str, tuple] | None, int]:
    """start ~ END 전 구간 페이징. ({date_iso: (o,h,l,c,v)}, 페이지 수). 실패 시 (None, 페이지 수)."""
    end_iso = END.isoformat()
    start_iso = start.isoformat()
    # parse_bar 의 date_iso <= last_iso drop 이 start 자체를 자르지 않도록 하루 전.
    last_iso = (start - timedelta(days=1)).isoformat()
    d1 = start.strftime("%Y%m%d")
    d2 = END
    bars: dict[str, tuple] = {}
    pages = 0
    while pages < MAX_PAGES_PER_TICKER:
        raw = call_with_retry(sh, conn, ticker, d1, d2.strftime("%Y%m%d"))
        pages += 1
        if raw is None:
            return None, pages
        page = [p for p in (parse_bar(r, end_iso, last_iso) for r in raw) if p]
        if not page:
            break
        for p in page:
            bars[p[0]] = p[1:]
        min_iso = min(p[0] for p in page)
        if min_iso <= start_iso:
            break
        next_d2 = date.fromisoformat(min_iso) - timedelta(days=1)
        if next_d2 >= d2:
            logger.warning("[%s] 페이징 진행 없음 (d2=%s) — 종료", ticker, d2)
            break
        d2 = next_d2
    else:
        logger.warning("[%s] 페이지 상한 %d 도달 — 종료", ticker, MAX_PAGES_PER_TICKER)
    return bars, pages


# ── 종목 처리 ─────────────────────────────────────────────
def run_one(conn, cursor, sh: Shared, ticker: str) -> dict:
    """종목 1건 재적재. 반환 dict 의 status ∈ {'ok','skip','empty','err'}."""
    cursor.execute(
        "SELECT date, open, high, low, close, volume FROM daily_prices "
        "WHERE ticker = %s AND date <= %s ORDER BY date",
        (ticker, END),
    )
    existing = {
        d.isoformat(): (o, h, lo, c, v) for d, o, h, lo, c, v in cursor.fetchall()
    }
    conn.commit()
    if not existing:
        return {"ticker": ticker, "status": "skip", "reason": "DB 행 없음"}

    start_iso = min(existing)
    end_iso = END.isoformat()
    old_close_end = existing[end_iso][3] if end_iso in existing else None

    t0 = time.monotonic()
    bars, pages = fetch_kis_bars(sh, conn, ticker, date.fromisoformat(start_iso))
    if bars is None:
        return {"ticker": ticker, "status": "err", "reason": "KIS 실패", "pages": pages}
    if not bars:
        logger.warning("[%s] KIS 0봉 (start=%s) — 변경 없음", ticker, start_iso)
        return {
            "ticker": ticker,
            "status": "empty",
            "pages": pages,
            "db_rows": len(existing),
        }

    # 9/11 초과·start 미만 행은 parse_bar 가 걸러야 한다 — 이중 방어.
    assert max(bars) <= end_iso, f"{ticker}: KIS 봉 {max(bars)} > end {end_iso}"
    assert min(bars) >= start_iso, f"{ticker}: KIS 봉 {min(bars)} < start {start_iso}"

    rows_upsert: list[tuple] = []
    changed = inserted = price_changed = volume_only = 0
    sample_change = None
    for d in sorted(bars):
        new = bars[d]
        old = existing.get(d)
        if old == new:
            continue
        rows_upsert.append((ticker, d, *new))
        if old is None:
            inserted += 1
            continue
        changed += 1
        if old[:4] != new[:4]:
            price_changed += 1
            if sample_change is None:
                sample_change = {"date": d, "old": old, "new": new}
        else:
            volume_only += 1

    if rows_upsert:
        try:
            execute_values(
                cursor, UPSERT_VALUES_SQL, rows_upsert, page_size=UPSERT_PAGE_SIZE
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("[%s] DB upsert 실패: %s", ticker, e)
            return {
                "ticker": ticker,
                "status": "err",
                "reason": f"upsert 실패: {e}",
                "pages": pages,
            }

    kis_first = min(bars)
    db_rows_before_kis = sum(1 for d in existing if d < kis_first)
    db_only = sum(1 for d in existing if d >= kis_first and d not in bars)
    new_close_end = bars[end_iso][3] if end_iso in bars else None
    f = None
    if old_close_end and new_close_end:
        f = round(new_close_end / old_close_end, 4)

    result = {
        "ticker": ticker,
        "status": "ok",
        "pages": pages,
        "elapsed_sec": round(time.monotonic() - t0, 1),
        "db_rows": len(existing),
        "kis_rows": len(bars),
        "db_first": start_iso,
        "kis_first": kis_first,
        "db_rows_before_kis": db_rows_before_kis,
        "db_only_rows": db_only,
        "upserted": len(rows_upsert),
        "changed": changed,
        "inserted": inserted,
        "price_changed": price_changed,
        "volume_only": volume_only,
        "old_close_end": old_close_end,
        "new_close_end": new_close_end,
        "f": f,
        "sample_change": sample_change,
    }
    if f is not None and abs(f - 1) > F_TOLERANCE:
        logger.warning(
            "[%s] close(%s) 스케일 변경 f=%.4f (%s → %s) · 변경 행=%d",
            ticker,
            end_iso,
            f,
            old_close_end,
            new_close_end,
            changed,
        )
    if kis_first > start_iso:
        logger.warning(
            "[%s] KIS 최초 봉 %s > DB 최초 봉 %s — 선행 %d행 유지",
            ticker,
            kis_first,
            start_iso,
            db_rows_before_kis,
        )
    return result


def worker(wid: int, q: queue.Queue, sh: Shared) -> None:
    """큐에서 종목을 꺼내 처리. 워커별 커넥션, BATCH_SIZE 마다 교체."""
    conn = get_connection()
    cursor = conn.cursor()
    n = 0
    try:
        while not sh.abort.is_set():
            try:
                ticker = q.get_nowait()
            except queue.Empty:
                break
            n += 1
            if n > 1 and (n - 1) % BATCH_SIZE == 0:
                cursor.close()
                conn.close()
                conn = get_connection()
                cursor = conn.cursor()
            if n > 1 and (n - 1) % TOKEN_REREAD_EVERY == 0:
                db_token, _ = read_db_token(conn)
                if db_token:
                    with sh.lock:
                        sh.token = db_token

            try:
                r = run_one(conn, cursor, sh, ticker)
            except Exception as e:
                conn.rollback()
                logger.error("[%s] 처리 실패, 스킵: %s", ticker, e)
                r = {"ticker": ticker, "status": "err", "reason": str(e)}

            with sh.lock:
                sh.results.append(r)
                sh.done += 1
                status = r["status"]
                if status == "ok":
                    sh.ok += 1
                    sh.upserted += r["upserted"]
                    sh.consecutive_fail = 0
                elif status == "skip":
                    sh.skip += 1
                elif status == "empty":
                    sh.empty += 1
                    sh.consecutive_fail = 0
                else:
                    sh.error += 1
                    sh.consecutive_fail += 1
                    if sh.consecutive_fail >= MAX_CONSECUTIVE_FAIL:
                        logger.error(
                            "연속 %d종목 실패 (합산) — 중단 (%d/%d)",
                            sh.consecutive_fail,
                            sh.done,
                            sh.total,
                        )
                        sh.abort.set()
                if sh.done % PROGRESS_EVERY == 0:
                    logger.info(
                        "진행: %d/%d (성공=%d, skip=%d, 0봉=%d, 실패=%d) · 콜=%d · 변경 행=%d · 경과=%.0fs",
                        sh.done,
                        sh.total,
                        sh.ok,
                        sh.skip,
                        sh.empty,
                        sh.error,
                        sh.calls,
                        sh.upserted,
                        time.monotonic() - sh.started,
                    )
    finally:
        cursor.close()
        conn.close()
        logger.info("worker %d 종료 (처리 %d종목)", wid, n)


def run(tickers: list[str]) -> int:
    total = len(tickers)
    logger.info(
        "KIS 수정주가 재적재 시작 — %d종목 · end=%s · workers=%d · 합산 ≤%d콜/s · gap=%.2fs",
        total,
        END,
        WORKERS,
        MAX_CALLS_PER_SEC,
        CALL_GAP_SEC,
    )

    conn = get_connection()
    try:
        token = prepare_token(conn)
    finally:
        conn.close()
    sh = Shared(token, total)

    q: queue.Queue = queue.Queue()
    for t in tickers:
        q.put(t)
    threads = [
        threading.Thread(target=worker, args=(i + 1, q, sh), name=f"w{i + 1}")
        for i in range(min(WORKERS, total))
    ]
    for th in threads:
        th.start()
    for th in threads:
        th.join()

    elapsed = time.monotonic() - sh.started
    results = sh.results
    aborted = sh.abort.is_set()
    failed = [r["ticker"] for r in results if r["status"] == "err"]
    scaled = [
        (r["ticker"], r["f"])
        for r in results
        if r["status"] == "ok" and r["f"] is not None and abs(r["f"] - 1) > F_TOLERANCE
    ]
    no_end_close = [
        r["ticker"]
        for r in results
        if r["status"] == "ok" and r["old_close_end"] is None
    ]
    kis_short = [
        (r["ticker"], r["db_first"], r["kis_first"], r["db_rows_before_kis"])
        for r in results
        if r["status"] == "ok" and r["kis_first"] > r["db_first"]
    ]
    logger.info(
        "완료%s: 성공=%d, skip=%d, 0봉=%d, 실패=%d · 총 콜=%d · 변경 행=%d · 소요=%.0fs",
        " (중단)" if aborted else "",
        sh.ok,
        sh.skip,
        sh.empty,
        sh.error,
        sh.calls,
        sh.upserted,
        elapsed,
    )
    logger.info("실패 종목 %d: %s", len(failed), failed)
    logger.info("f≠1 종목 %d: %s", len(scaled), scaled)
    logger.info("close(%s) 부재 종목 %d: %s", END, len(no_end_close), no_end_close)
    logger.info("KIS 시작일 미달 종목 %d: %s", len(kis_short), kis_short)

    with open(_report_file, "w", encoding="utf-8") as fp:
        json.dump(
            {
                "started_at": _stamp.isoformat(),
                "end": END.isoformat(),
                "workers": WORKERS,
                "tickers": total,
                "ok": sh.ok,
                "skip": sh.skip,
                "empty": sh.empty,
                "error": sh.error,
                "aborted": aborted,
                "calls": sh.calls,
                "upserted": sh.upserted,
                "elapsed_sec": round(elapsed, 1),
                "failed": failed,
                "scaled": scaled,
                "no_end_close": no_end_close,
                "kis_short": kis_short,
                "results": sorted(results, key=lambda r: r["ticker"]),
            },
            fp,
            ensure_ascii=False,
            indent=1,
        )
    logger.info("결과 JSON → %s", _report_file)
    return 1 if (sh.error or aborted) else 0


def main() -> int:
    setup_logging("prices_backfill_kis")
    if not fetch_prices.KIS_APP_KEY or not fetch_prices.KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정 (collector/.env)")
        return 1
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        return 1

    parser = argparse.ArgumentParser(
        description="KIS 일봉(수정주가) → daily_prices 전면 재적재 (date <= 2026-09-11). "
        "end 고정, start = 종목별 DB 최초 봉."
    )
    parser.add_argument(
        "--tickers",
        default=None,
        help="쉼표 구분 종목 코드 (예: 005930,000660). 미지정 시 is_active 전종목.",
    )
    args = parser.parse_args()

    tks: list[str] | None = None
    if args.tickers:
        tks = [t.strip() for t in args.tickers.split(",") if t.strip()]
        if not tks:
            logger.error("--tickers 파싱 실패")
            return 2
    if tks is None:
        conn = get_connection()
        try:
            cur = conn.cursor()
            tks = get_all_active_tickers(cur)
            cur.close()
        finally:
            conn.close()

    return run(tks)


if __name__ == "__main__":
    sys.exit(main())
