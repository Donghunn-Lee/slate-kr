"""
DART 고유번호(corpCode.xml) + 기업개황(company.json) → stocks 종목 목록 동기화.

조회
  corpCode.xml 1콜로 stock_code 가 있는 법인 전부(상폐 잔존 포함)를 받고, 법인마다 기업개황을
  1콜씩 받아 corp_cls 로 시장을 가른다. Y → KOSPI · K → KOSDAQ, N(코넥스) · E(상폐 · 기타)는 제외.
  스팩은 이름 규칙(SPAC_NAME_RE)으로 뺀다. corpCode 는 법인당 보통주 1코드라 우선주는 애초에 없다.

적재
  ticker · corp_code · name(기업개황 stock_name) · market 을 upsert 하고 is_active=true 로 되돌린다
  (재상장 복구 포함). 활성인데 이번 목록에 없는 종목은 비활성. 기업개황 조회에 실패한 종목은
  응답을 못 받았을 뿐 이탈 근거가 아니라 비활성 판정에서 뺀다.

가드
  · corpCode stock_code 항목 < MIN_CORP_CODES: 응답 이상, 쓰기 없이 exit 1
  · 조립된 KOSPI · KOSDAQ 종목 < MIN_COLLECTED: 쓰기 없이 exit 1
  · 기업개황 실패 > MAX_COMPANY_FAILURES: upsert 만 하고 비활성 skip, exit 1
  · 이탈 > MAX_DEACTIVATE (--max-deactivate 로 1회 상향): upsert 만 하고 비활성 skip, exit 1

CLI
  --dry-run           DB 는 SELECT 만. 변경 예정을 로그로 (기본은 실행 — weekly 가 플래그 없이 돈다)
  --max-deactivate N  이번 run 의 비활성 상한
"""

import argparse
import io
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from typing import NamedTuple, Optional

import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from db import get_connection
from log_setup import setup_logging

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
logger = logging.getLogger(__name__)

DART_API_KEY = os.getenv("DART_API_KEY")

MARKET_BY_CLS = {"Y": "KOSPI", "K": "KOSDAQ"}

# 실측(2026-11) 스팩 253종목의 이름(KRX 약칭 · DART corp_name)을 전부 잡고 비스팩은 하나도 잡지 않는다.
# '스팩' 포함만 보면 아스팩오일이 걸린다 — 스팩 약칭은 '스팩' 앞뒤에 회차(제N호)가 붙거나 '스팩'으로 끝난다.
SPAC_NAME_RE = re.compile(r"기업인수목적|스팩제?\d+호|스팩$")

# 가드
#   MIN_CORP_CODES: corpCode 의 stock_code 항목(실측 4,013) 이 이보다 적으면 응답 이상.
#   MIN_COLLECTED: 조립된 KOSPI · KOSDAQ 종목(실측 2,588) 이 이보다 적으면 조회 부분 실패.
#   MAX_COMPANY_FAILURES: 기업개황 실패가 이보다 많으면 비활성 판정을 믿지 않는다.
#   MAX_DEACTIVATE: 한 회 비활성 상한. 초과 시 대량 오탐 우려로 skip — 원인을 확인한 뒤
#     --max-deactivate 로 그 run 만 올린다.
MIN_CORP_CODES = 3500
MIN_COLLECTED = 2000
MAX_COMPANY_FAILURES = 100
MAX_DEACTIVATE = 30

CALL_INTERVAL_SEC = 0.1
PROGRESS_EVERY = 500
UPSERT_PAGE_SIZE = 500


class SyncPlan(NamedTuple):
    inserts: list[dict]  # stocks 에 없는 ticker
    reactivates: list[dict]  # 비활성 행이 다시 목록에 나타남
    renames: list[tuple[str, str, str]]  # (ticker, 현재 name, 새 name)
    market_changes: list[tuple[str, str, str]]  # (ticker, 현재 market, 새 market)
    corp_code_changes: list[tuple[str, Optional[str], str]]  # (ticker, 현재, 새)
    deactivates: list[tuple[str, str, str]]  # (ticker, 현재 name, 사유)


def fetch_corp_codes() -> dict[str, str]:
    """DART corpCode.xml에서 stock_code(=ticker) → corp_code 매핑 반환."""
    url = "https://opendart.fss.or.kr/api/corpCode.xml"
    res = requests.get(url, params={"crtfc_key": DART_API_KEY}, timeout=30)
    res.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)

    mapping: dict[str, str] = {}
    for item in tree.getroot().findall("list"):
        stock_code = (item.findtext("stock_code") or "").strip()
        corp_code = (item.findtext("corp_code") or "").strip()
        if stock_code and corp_code:
            mapping[stock_code] = corp_code

    return mapping


def is_spac(name: str) -> bool:
    return bool(SPAC_NAME_RE.search(name))


def fetch_company(corp_code: str) -> dict:
    """기업개황 1건. 요청 예외 · status ≠ 000 · 상장사인데 stock_name 없음은 raise."""
    res = requests.get(
        "https://opendart.fss.or.kr/api/company.json",
        params={"crtfc_key": DART_API_KEY, "corp_code": corp_code},
        timeout=10,
    )
    res.raise_for_status()
    body = res.json()
    if body.get("status") != "000":
        raise RuntimeError(f"status={body.get('status')} {body.get('message')}")
    if body.get("corp_cls") in MARKET_BY_CLS and not (body.get("stock_name") or "").strip():
        raise RuntimeError("stock_name 없음")
    return body


def fetch_companies(corp_codes: dict[str, str]) -> tuple[dict[str, dict], dict[str, str]]:
    """ticker → 기업개황. 실패한 종목은 skip 하고 ticker → 사유로 따로 돌려준다."""
    companies: dict[str, dict] = {}
    failures: dict[str, str] = {}
    started = time.monotonic()
    for i, (ticker, corp_code) in enumerate(sorted(corp_codes.items()), 1):
        try:
            companies[ticker] = fetch_company(corp_code)
        except Exception as e:
            failures[ticker] = str(e)
        if i % PROGRESS_EVERY == 0:
            logger.info(
                "기업개황 진행: %d/%d (실패=%d, %.0fs)",
                i, len(corp_codes), len(failures), time.monotonic() - started,
            )
        time.sleep(CALL_INTERVAL_SEC)
    logger.info(
        "기업개황 완료: 성공=%d, 실패=%d, 소요=%.0fs",
        len(companies), len(failures), time.monotonic() - started,
    )
    return companies, failures


def assemble(
    corp_codes: dict[str, str], companies: dict[str, dict]
) -> tuple[list[dict], dict[str, tuple[str, str]]]:
    """조회에 성공한 법인을 upsert 대상과 제외(ticker → (stock_name, 사유))로 가른다."""
    collected: list[dict] = []
    excluded: dict[str, tuple[str, str]] = {}
    for ticker in sorted(companies):
        body = companies[ticker]
        name = (body.get("stock_name") or "").strip()
        cls = body.get("corp_cls")
        market = MARKET_BY_CLS.get(cls)
        if market is None:
            excluded[ticker] = (name, f"corp_cls={cls}")
        elif is_spac(name):
            excluded[ticker] = (name, "스팩")
        else:
            collected.append(
                {"ticker": ticker, "corp_code": corp_codes[ticker], "name": name, "market": market}
            )
    return collected, excluded


def plan_sync(
    collected: list[dict],
    excluded: dict[str, tuple[str, str]],
    failed: set[str],
    current: dict[str, tuple],
) -> SyncPlan:
    """current = stocks 전 행 {ticker: (name, market, corp_code, is_active)}.

    비활성 대상 = 활성 행 중 이번 목록에 없고 기업개황 조회도 실패하지 않은 종목.
    """
    inserts, reactivates, renames, market_changes, corp_code_changes = [], [], [], [], []
    for s in collected:
        row = current.get(s["ticker"])
        if row is None:
            inserts.append(s)
            continue
        name, market, corp_code, is_active = row
        if not is_active:
            reactivates.append(s)
        if name != s["name"]:
            renames.append((s["ticker"], name, s["name"]))
        if market != s["market"]:
            market_changes.append((s["ticker"], market, s["market"]))
        if corp_code != s["corp_code"]:
            corp_code_changes.append((s["ticker"], corp_code, s["corp_code"]))

    keep = {s["ticker"] for s in collected} | failed
    deactivates = [
        (ticker, row[0], excluded[ticker][1] if ticker in excluded else "corpCode 없음")
        for ticker, row in sorted(current.items())
        if row[3] and ticker not in keep
    ]
    return SyncPlan(
        inserts, reactivates, renames, market_changes, corp_code_changes, deactivates
    )


def deactivation_block(n_deactivates: int, n_failures: int, max_deactivate: int) -> Optional[str]:
    """비활성 단계를 건너뛸 사유. 통과면 None."""
    if n_failures > MAX_COMPANY_FAILURES:
        return f"기업개황 실패({n_failures}) > 상한({MAX_COMPANY_FAILURES}) — 비활성 판정 불신"
    if n_deactivates > max_deactivate:
        return (
            f"이탈 후보({n_deactivates}) > 상한({max_deactivate}) — 확인 뒤 "
            "--max-deactivate 로 재실행"
        )
    return None


def load_current(cursor) -> dict[str, tuple]:
    cursor.execute("SELECT ticker, name, market, corp_code, is_active FROM stocks")
    return {row[0]: tuple(row[1:]) for row in cursor.fetchall()}


def upsert_stocks(cursor, stocks: list[dict]) -> None:
    # 재상장 복구: 과거 비활성 처리된 티커가 목록에 다시 나타나면 is_active=true 로 되돌린다.
    execute_values(
        cursor,
        """
        INSERT INTO stocks (ticker, corp_code, name, market) VALUES %s
        ON CONFLICT (ticker) DO UPDATE SET
            corp_code = EXCLUDED.corp_code,
            name = EXCLUDED.name,
            market = EXCLUDED.market,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        """,
        [(s["ticker"], s["corp_code"], s["name"], s["market"]) for s in stocks],
        page_size=UPSERT_PAGE_SIZE,
    )


def deactivate_stocks(cursor, tickers: list[str]) -> None:
    cursor.execute(
        "UPDATE stocks SET is_active = false, updated_at = CURRENT_TIMESTAMP "
        "WHERE ticker = ANY(%s) AND is_active = true",
        (tickers,),
    )


def log_plan(plan: SyncPlan, n_upsert: int, failures: dict[str, str]) -> None:
    logger.info(
        "[PLAN] upsert=%d (신규=%d, 재활성=%d, 이름 변경=%d, market 변경=%d, corp_code 변경=%d) · "
        "비활성=%d · 기업개황 실패=%d",
        n_upsert, len(plan.inserts), len(plan.reactivates), len(plan.renames),
        len(plan.market_changes), len(plan.corp_code_changes), len(plan.deactivates),
        len(failures),
    )
    for s in plan.inserts:
        logger.info("[신규] %s %s %s", s["ticker"], s["name"], s["market"])
    for s in plan.reactivates:
        logger.info("[재활성] %s %s %s", s["ticker"], s["name"], s["market"])
    for ticker, old, new in plan.renames:
        logger.info("[이름 변경] %s %s → %s", ticker, old, new)
    for ticker, old, new in plan.market_changes:
        logger.info("[market 변경] %s %s → %s", ticker, old, new)
    for ticker, old, new in plan.corp_code_changes:
        logger.info("[corp_code 변경] %s %s → %s", ticker, old, new)
    for ticker, name, reason in plan.deactivates:
        logger.info("[비활성] %s %s (%s)", ticker, name, reason)
    for ticker, reason in sorted(failures.items()):
        logger.warning("[기업개황 실패] %s %s", ticker, reason)


def main():
    setup_logging("stocks")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true", help="DB 는 SELECT 만, 변경 예정을 로그로"
    )
    parser.add_argument(
        "--max-deactivate",
        type=int,
        default=MAX_DEACTIVATE,
        metavar="N",
        help=f"이번 run 의 비활성 상한 (기본 {MAX_DEACTIVATE})",
    )
    args = parser.parse_args()

    for var in ("DART_API_KEY", "DATABASE_URL"):
        if not os.getenv(var):
            logger.error("%s 미설정 (collector/.env)", var)
            sys.exit(1)

    logger.info("DART corpCode.xml 다운로드 중...")
    try:
        corp_codes = fetch_corp_codes()
    except Exception as e:
        logger.error("corpCode.xml 조회 실패: %s", e)
        sys.exit(1)
    logger.info("corpCode stock_code 항목: %d", len(corp_codes))
    if len(corp_codes) < MIN_CORP_CODES:
        logger.error(
            "corpCode stock_code 항목(%d) < 하한(%d) — 응답 이상, 쓰기 없이 종료",
            len(corp_codes), MIN_CORP_CODES,
        )
        sys.exit(1)

    companies, failures = fetch_companies(corp_codes)
    collected, excluded = assemble(corp_codes, companies)
    cls_counts: dict[str, int] = {}
    for body in companies.values():
        cls = body.get("corp_cls")
        cls_counts[cls] = cls_counts.get(cls, 0) + 1
    spacs = sorted((t, n) for t, (n, reason) in excluded.items() if reason == "스팩")
    logger.info(
        "corp_cls 분포: %s · 스팩 제외=%d · 조립 KOSPI=%d, KOSDAQ=%d",
        ", ".join(f"{k}={v}" for k, v in sorted(cls_counts.items(), key=lambda kv: str(kv[0]))),
        len(spacs),
        sum(1 for s in collected if s["market"] == "KOSPI"),
        sum(1 for s in collected if s["market"] == "KOSDAQ"),
    )
    if len(collected) < MIN_COLLECTED:
        logger.error(
            "조립 종목 수(%d) < 하한(%d) — 기업개황 부분 실패 정황, 쓰기 없이 종료",
            len(collected), MIN_COLLECTED,
        )
        sys.exit(1)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        plan = plan_sync(collected, excluded, set(failures), load_current(cursor))
        log_plan(plan, len(collected), failures)
        blocked = deactivation_block(len(plan.deactivates), len(failures), args.max_deactivate)
        if blocked:
            logger.warning("비활성 skip: %s", blocked)

        if args.dry_run:
            logger.info("[스팩 제외] %s", ", ".join(f"{t}({n})" for t, n in spacs))
            logger.info("dry-run — DB 변경 없음")
        else:
            upsert_stocks(cursor, collected)
            if not blocked and plan.deactivates:
                deactivate_stocks(cursor, [t for t, _, _ in plan.deactivates])
            conn.commit()
            logger.info(
                "완료: upsert=%d, 비활성=%d",
                len(collected), 0 if blocked else len(plan.deactivates),
            )
    except Exception as e:
        logger.error("DB 갱신 실패 — rollback: %s", e)
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

    # 가드 미통과는 upsert 를 남기고 비활성만 건너뛴 상태 — 확인이 필요해 run 을 실패로 끝낸다.
    if blocked:
        sys.exit(1)


if __name__ == "__main__":
    main()
