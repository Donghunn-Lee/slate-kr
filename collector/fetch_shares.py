"""
DART 주식총수 현황(stockTotqySttus.json) 보통주 발행주식총수 → stocks.shares 동기화 + bps 재계산.

용도
  시가총액(shares × 종가)과 bps(지배주주지분 ÷ shares)의 주식 수. 정기보고서 기준이라 병합 · 분할 ·
  소각은 다음 보고서가 나올 때까지 반영되지 않는다 — 설계상 수용, 보정하지 않는다.

조회 (종목마다 1~MAX_REPORTS 콜)
  활성 · corp_code 있는 종목마다 get_available_reports() 의 마지막 (bsns_year, reprt_code) 부터
  prev_period 로 한 보고서씩 내려가며 보통주 행(is_common_label)의 istc_totqy 를 찾는다. 응답 013 ·
  보통주 행 없음(스팩 등) · 값 "-" 이면 다음 보고서, 최대 MAX_REPORTS 개(1년). 요청 예외 · 013 외
  status 는 그 종목 실패로 끝낸다 — 폴백하면 더 오래된 값으로 덮을 수 있다.

적재
  값이 바뀐 종목만 배치 UPDATE → fetch_financials.sync_bps 로 bps 를 새 shares 에 맞춘 뒤
  한 트랜잭션으로 commit (시총과 PBR 이 서로 다른 주식 수를 보는 창을 없앤다).

가드
  · 유효 응답 < MIN_VALID: 쓰기 없이 exit 1
  · MAX_REPORTS 개 보고서에 값 없음 · 조회 실패: 그 종목만 skip(기존 값 유지) + 목록 로그
  · new/old 가 GUARD_RATIO 배 이상 · 1/GUARD_RATIO 이하: 그 종목만 skip(기존 값 유지) + WARN
  · 2배 이상 · 0.5배 이하 변화는 적재하고 WARN — 병합이면 1/10 도 정상

CLI
  --dry-run  DB 는 SELECT 만. 변경 예정 (ticker, old, new, ratio) 전부와 비율 분포를 로그로
"""

import argparse
import bisect
import logging
import os
import re
import sys
import time
from typing import NamedTuple, Optional

import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from db import get_connection
from fetch_financials import DART_NO_DATA, get_available_reports, prev_period, sync_bps
from log_setup import setup_logging

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
logger = logging.getLogger(__name__)

DART_API_KEY = os.getenv("DART_API_KEY")

# 보통주 행의 se 표기는 회사마다 다르다 — 실측(2026-11) "보통주" 외에 "보통주식" · "의결권 있는 주식" ·
# "의결권 있는 주식\n(보통주)" · "기명식보통주" 등. 공백 · 줄바꿈을 지운 뒤 우선주 · 종류주 · 의결권 없는
# 주식 표기는 빼고, '보통주' 를 포함하거나 '의결권(이)있는' 으로 시작하면 보통주 행으로 본다.
NON_COMMON_MARKERS = ("우선", "종류", "없는")
VOTING_PREFIXES = ("의결권있는", "의결권이있는")

MAX_REPORTS = 4  # 최신 보고서 포함 1년치
# fetch_stocks.MIN_COLLECTED 와 같은 하한 — 유효 응답(실측 2,628 / 대상 2,651) 이 이보다 적으면 조회 이상.
MIN_VALID = 2000
BIG_MOVE_RATIO = 2.0
# DART 원본 단위 오류(실측 2026-11 ×714 · ×1,000 · ×10⁶)를 거른다. 병합 · 분할(실측 ×0.2~×10)은 통과.
GUARD_RATIO = 100.0
CALL_INTERVAL_SEC = 0.1
PROGRESS_EVERY = 500
UPDATE_PAGE_SIZE = 500

# dry-run 비율 분포 구간 (new/old). 양 끝은 [SHARES_BIG_MOVE] 경계와 같다.
RATIO_EDGES = (0.5, 0.9, 0.99, 1.0, 1.01, 1.1, 2.0)
RATIO_LABELS = (
    "≤0.5", "0.5~0.9", "0.9~0.99", "0.99~1", "1~1.01", "1.01~1.1", "1.1~2", "≥2",
)


class Lookup(NamedTuple):
    shares: Optional[int]
    stage: int  # 값을 찾은(또는 멈춘) 보고서 순번. 0 = 최신
    error: Optional[str]  # 요청 예외 · 013 외 status


class SharesPlan(NamedTuple):
    updates: list[tuple[str, int]]  # (ticker, new_shares)
    big_moves: list[tuple[str, int, int, float]]  # (ticker, old, new, new/old)
    blocked: list[tuple[str, int, int, float]]  # GUARD_RATIO 밖 — 적재하지 않는다


def parse_shares(raw) -> Optional[int]:
    """istc_totqy 문자열 → 양의 정수. "-" · 0 이하 · 파싱 불가는 None."""
    try:
        val = int(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return val if val > 0 else None


def is_common_label(se) -> bool:
    label = re.sub(r"\s+", "", se or "")
    if any(marker in label for marker in NON_COMMON_MARKERS):
        return False
    return "보통주" in label or label.startswith(VOTING_PREFIXES)


def pick_common_shares(items: list[dict]) -> Optional[int]:
    """첫 보통주 행의 istc_totqy. 행이 없거나 값이 무효면 None."""
    for row in items:
        if is_common_label(row.get("se")):
            return parse_shares(row.get("istc_totqy"))
    return None


def fetch_report_shares(
    corp_code: str, bsns_year: str, reprt_code: str
) -> tuple[Optional[int], Optional[str]]:
    """보고서 1건 → (보통주 istc_totqy, 오류). 013 · 보통주 행 없음 · 무효 값은 (None, None)."""
    try:
        res = requests.get(
            "https://opendart.fss.or.kr/api/stockTotqySttus.json",
            params={
                "crtfc_key": DART_API_KEY,
                "corp_code": corp_code,
                "bsns_year": bsns_year,
                "reprt_code": reprt_code,
            },
            timeout=10,
        )
        body = res.json()
    except Exception as e:
        return None, f"요청 실패: {e}"
    status = body.get("status")
    if status == DART_NO_DATA:
        return None, None
    if status != "000":
        return None, f"status={status} {body.get('message')}"
    return pick_common_shares(body.get("list") or []), None


def lookup_shares(corp_code: str, latest: tuple[str, str]) -> Lookup:
    """latest 부터 prev_period 로 내려가며 최대 MAX_REPORTS 개 보고서를 본다."""
    period = latest
    for stage in range(MAX_REPORTS):
        shares, error = fetch_report_shares(corp_code, *period)
        time.sleep(CALL_INTERVAL_SEC)
        if error is not None or shares is not None:
            return Lookup(shares, stage, error)
        period = prev_period(*period)
    return Lookup(None, MAX_REPORTS, None)


def plan_updates(found: dict[str, int], current: dict[str, Optional[int]]) -> SharesPlan:
    """found = 이번에 찾은 값, current = 대상 종목 {ticker: 현재 shares}. 값이 바뀐 종목만."""
    updates, big_moves, blocked = [], [], []
    for ticker, new in sorted(found.items()):
        old = current.get(ticker)
        if new == old:
            continue
        if old and old > 0:
            ratio = new / old
            if ratio >= GUARD_RATIO or ratio <= 1 / GUARD_RATIO:
                blocked.append((ticker, old, new, ratio))
                continue
            if ratio >= BIG_MOVE_RATIO or ratio <= 1 / BIG_MOVE_RATIO:
                big_moves.append((ticker, old, new, ratio))
        updates.append((ticker, new))
    return SharesPlan(updates, big_moves, blocked)


def ratio_label(ratio: float) -> str:
    """new/old 의 분포 구간. 양 끝은 [SHARES_BIG_MOVE] 처럼 닫는다(≤0.5 · ≥2)."""
    if ratio >= BIG_MOVE_RATIO:
        return RATIO_LABELS[-1]
    return RATIO_LABELS[bisect.bisect_left(RATIO_EDGES, ratio)]


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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true", help="DB 는 SELECT 만, 변경 예정을 로그로"
    )
    args = parser.parse_args()

    for var in ("DART_API_KEY", "DATABASE_URL"):
        if not os.getenv(var):
            logger.error("%s 미설정 (collector/.env)", var)
            sys.exit(1)

    # DART 조회가 수 분 걸려 그동안 커넥션을 쥐고 있지 않는다 — 대상만 읽고 닫는다.
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT ticker, corp_code, shares FROM stocks "
            "WHERE is_active = true AND corp_code IS NOT NULL ORDER BY ticker"
        )
        targets = cursor.fetchall()
    finally:
        conn.close()
    current = {ticker: shares for ticker, _, shares in targets}

    latest = get_available_reports()[-1]
    logger.info("대상 %d종목, 최신 보고서 %s/%s 부터 최대 %d개", len(targets), *latest, MAX_REPORTS)

    found: dict[str, int] = {}
    stage_counts = [0] * MAX_REPORTS
    exhausted: list[str] = []
    failed: list[tuple[str, str]] = []
    started = time.monotonic()
    for i, (ticker, corp_code, _) in enumerate(targets, 1):
        result = lookup_shares(corp_code, latest)
        if result.error is not None:
            failed.append((ticker, result.error))
        elif result.shares is None:
            exhausted.append(ticker)
        else:
            found[ticker] = result.shares
            stage_counts[result.stage] += 1
        if i % PROGRESS_EVERY == 0:
            logger.info(
                "진행: %d/%d (유효=%d, 값 없음=%d, 실패=%d, %.0fs)",
                i, len(targets), len(found), len(exhausted), len(failed),
                time.monotonic() - started,
            )

    logger.info(
        "조회 완료: 유효=%d (단계별 %s), %d개 보고서 뒤 값 없음=%d, 실패=%d, 소요=%.0fs",
        len(found), " · ".join(f"{s}={n}" for s, n in enumerate(stage_counts)),
        MAX_REPORTS, len(exhausted), len(failed), time.monotonic() - started,
    )
    if exhausted:
        logger.warning("값 없음 — 기존 값 유지 %d개: %s", len(exhausted), ", ".join(exhausted))
    for ticker, error in failed:
        logger.warning("조회 실패 — 기존 값 유지 ticker=%s %s", ticker, error)
    if len(found) < MIN_VALID:
        logger.error("유효 응답 %d < 하한 %d — 조회 이상, 쓰기 없이 종료", len(found), MIN_VALID)
        sys.exit(1)

    plan = plan_updates(found, current)
    for ticker, old, new, ratio in plan.big_moves:
        logger.warning(
            "[SHARES_BIG_MOVE] ticker=%s old=%s new=%s ratio=%.4f",
            ticker, f"{old:,}", f"{new:,}", ratio,
        )
    for ticker, old, new, ratio in plan.blocked:
        logger.warning(
            "[SHARES_RATIO_GUARD] ticker=%s old=%s new=%s ratio=%.4f — 기존 값 유지",
            ticker, f"{old:,}", f"{new:,}", ratio,
        )
    filled = sum(1 for t, _ in plan.updates if not current.get(t))

    if args.dry_run:
        buckets = dict.fromkeys(RATIO_LABELS, 0)
        for ticker, new in plan.updates:
            old = current.get(ticker)
            if old:
                ratio = new / old
                buckets[ratio_label(ratio)] += 1
                logger.info("[변경] %s %s → %s (%.4f)", ticker, f"{old:,}", f"{new:,}", ratio)
            else:
                logger.info("[변경] %s %s → %s (NULL·0 → 값)", ticker, old, f"{new:,}")
        logger.info(
            "[분포] 변경 %d: %s · NULL·0→값 %d · 비율 가드 skip %d",
            len(plan.updates), ", ".join(f"{k}={v}" for k, v in buckets.items()), filled,
            len(plan.blocked),
        )
        logger.info("dry-run — DB 변경 없음")
        return

    conn = get_connection()
    try:
        cursor = conn.cursor()
        apply_updates(cursor, plan.updates)
        bps_rows = sync_bps(cursor)
        conn.commit()
    except Exception as e:
        logger.error("DB 갱신 실패 — rollback: %s", e)
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

    logger.info(
        "완료: 대상=%d, 유효=%d, shares 변경=%d (NULL·0→값 %d, 2배·0.5배 밖 변동 %d), "
        "비율 가드 skip=%d, 값 없음=%d, 조회 실패=%d, bps 갱신=%d행",
        len(targets), len(found), len(plan.updates), filled, len(plan.big_moves),
        len(plan.blocked), len(exhausted), len(failed), bps_rows,
    )


if __name__ == "__main__":
    main()
