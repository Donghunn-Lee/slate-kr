import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from dotenv import load_dotenv
from typing import Optional
import psycopg2
from psycopg2.extras import execute_values
import requests
import time

from db import get_connection
from log_setup import setup_logging

# 재시도 대상 DB 예외 — connection 절단·소켓 종료류.
# insert_financial/mark_non_filer 내부의 광범위 `except Exception` 이 이걸
# 삼키지 않도록 별도로 잡아 raise 시킨다 (아래 두 함수의 handler 참고).
_DB_RETRY_EXC = (psycopg2.OperationalError, psycopg2.InterfaceError)

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
logger = logging.getLogger(__name__)

DART_API_KEY = os.getenv("DART_API_KEY")

# 필요한 계정 항목만 추출
TARGET_ACCOUNTS = {
    "ifrs-full_Revenue": "revenue",
    "dart_OperatingIncomeLoss": "operating_profit",
    "ifrs-full_ProfitLossAttributableToOwnersOfParent": "net_income",
    "ifrs-full_ProfitLoss": "net_income",  # OFS 폴백
    "ifrs-full_Assets": "total_assets",
    "ifrs-full_EquityAttributableToOwnersOfParent": "total_equity",
    "ifrs-full_Equity": "total_equity",  # OFS 폴백
    "ifrs-full_BasicEarningsLossPerShare": "eps",
    # bps, dps는 DART에서 직접 제공 안 함 — 별도 처리 필요
}

# sj_div 우선순위: 해당 key에 선호 구분이 있으면 그 값을 우선 사용
_PREFERRED_SJ_DIV = {
    "revenue": "IS",
    "operating_profit": "IS",
    "net_income": "IS",
    "total_assets": "BS",
    "total_equity": "BS",
    # eps: 우선순위 없음 (첫 번째 값 사용)
}

# account_id 우선순위: 해당 key에 선호 account_id가 있으면 그 값을 우선 사용
# 선호 account_id로 적재된 이후엔 폴백 account_id 값을 무시한다
_PREFERRED_ACCOUNTS = {
    "net_income": "ifrs-full_ProfitLossAttributableToOwnersOfParent",
    "total_equity": "ifrs-full_EquityAttributableToOwnersOfParent",
}

RECONNECT_EVERY = 500  # period 내 연속 스킵 시 Neon SSL 타임아웃 방지
BPS_UPDATE_PAGE_SIZE = 500

# 부풀림 sanity 게이트 상수 — |값| 이 이 이상이면 삽입 skip.
# 실측 정상 최대 신한지주 total_assets ≈ 8.16e14, 관측 최소 부풀림 ≈ 5.8e15
# (007720 2024 Q3 net_income). DART XBRL unit 오태그는 최소 ×1000 이라
# 정상 최대치와 최소 부풀림치 사이 경계값 2e15 로 설정.
ABS_VALUE_CAP = 2e15

# 게이트 검사 대상 컬럼 (5개 재무 수치)
_GATE_COLS = ("revenue", "operating_profit", "net_income", "total_assets", "total_equity")

# 표시통화 게이트 — DART fnlttSinglAcntAll 은 회사가 신고한 표시통화 그대로
# thstrm_amount 를 반환한다. IFRS 상 표시통화 변경(예: 241560 두산밥캣이
# 2023 사업보고서부터 KRW → USD 로 전환) 은 정당하나, 이 파이프라인은
# KRW 원 단위 저장 전제. 비-KRW 항목이 하나라도 있으면 skip.
EXPECTED_CURRENCY = "KRW"

# non-KRW 종목의 단일 소스는 stocks.reporting_currency (기본 'KRW'). web 도 같은 컬럼을 읽어
# 재무 슬레이트·핵심 지표 대신 안내를 보인다. non-KRW 로 등록된 종목은 financial_statements
# 수치 7컬럼이 NULL 로 격리된 상태를 전제한다.
#   known(등록된 종목)의 non-KRW 공시 → WARN·exit 미기여 (매 수집 창 exit 1 을 만들어 알람
#     신호 가치를 잃는 걸 막는다). 통화가 바뀌면(CNY→USD 등) 컬럼만 따라 바꾼다.
#   신규 발견 → isolate_non_krw 가 게이트를 전부 통과한 건만 run 안에서 격리·등록하고
#     (WARN·exit 미기여), 거절된 건은 exit 1 로 남겨 web/sql/isolate_non_krw_ticker.sql 로 수동.
#   known 종목이 KRW 로 명시 복귀하면 적재한다. 컬럼은 되돌리지 않는다 — 사람이 판단.
# 게이트 (전부 DB 쓰기 전. 하나라도 어긋나면 그 종목은 손대지 않는다)
#   이번 공시의 대상 항목 통화가 전부 같은 비-KRW 통화 · 직전 period 공시도 같은 통화
#   (직전이 KRW 면 진짜 전환이거나 DART 라벨 오류 — 수동) · run 당 신규 격리 상한.
#   직전 period 가 DART 미공시(013 확정)이고 적재 이력이 0행이면 첫 보고서로 보고 통과한다.
MAX_NON_KRW_ISOLATIONS_PER_RUN = 3
# 격리 트랜잭션에서 NULL 로 만드는 컬럼. 행은 지우지 않는다 — 지우면 매 수집마다 DART 재조회·
# known WARN 이 반복되고, total_equity 를 남기면 sync_bps 가 bps 를 다시 채운다.
_ISOLATE_COLS = (
    "revenue", "operating_profit", "net_income", "total_assets", "total_equity", "eps", "bps",
)
# 격리 산출물(격리 SQL · before 스냅샷 · summary.json). Weekly 가 artifact 로 올린다.
NON_KRW_OUT_ROOT = os.path.join(os.path.dirname(__file__), "logs", "non_krw")

# check_unit_suspects Rule(1) 확인 완료 (ticker, year) 쌍.
# 각 filing 원본이 자기 자신에 충실하다고 확인된 케이스만 등록 — 재발 시
# WARN 을 억제해 신호 노이즈를 낮춘다. Rule(2) [UNIT_SUSPECT_CAP] 은 부풀림
# 잔존 검출이라 성격이 달라 억제 대상 아님.
CHECKED_UNIT_SUSPECTS = frozenset({
    ("046390", 2025),  # DART 원본·frmtrm 정합 (원본 충실)
    ("226330", 2024),  # DART 원본·frmtrm 정합 (원본 충실)
    ("226330", 2023),  # DART 원본·frmtrm 정합 (원본 충실)
    ("217820", 2022),  # 2022 annual 정정·합병류 재작성 정황, 2021 원 filing 정합
})

# DART '조회된 데이터가 없습니다' — 비공시 마킹은 이 응답이 확정된 경우에만 한다.
DART_NO_DATA = "013"

# is_financial_filer=false 여도 상장 후 이 기간 안이면 매 run 재시도한다. 신규 상장은 첫 정기보고서
# 전 period 를 조회하다 마킹되는데, 그 뒤 나온 보고서까지 영구 제외되지 않게 한다.
NON_FILER_RETRY_DAYS = 365

_QUARTER_MAP = {"11011": 4, "11012": 2, "11013": 1, "11014": 3}
_REPORT_TYPE_MAP = {
    "11011": "annual",
    "11012": "quarter",
    "11013": "quarter",
    "11014": "quarter",
}

# ── EPS 폴백 상수 ──────────────────────────────────────────
_AID_EPS_CONT = "ifrs-full_BasicEarningsLossPerShareFromContinuingOperations"
_AID_EPS_DISC = "ifrs-full_BasicEarningsLossPerShareFromDiscontinuedOperations"
_EPS_DIV_PRIO = {"IS": 0, "CIS": 1}
# 정규화 후 매칭 대상 집합
_EPS_NM_TARGETS = frozenset(
    {
        "보통주기본주당이익",
        "보통주기본주당순이익",
        "보통주기본주당순손익",
        # 정규화 후 형태 — _normalize_eps_nm이 "및희석" 제거하므로
        # "기본및희석주당이익" → "기본주당이익"
        # "보통주기본및희석주당손익" → "보통주기본주당손익"
        "기본주당이익",
        "보통주기본주당손익",
    }
)


def _normalize_eps_nm(nm: str) -> str:
    """account_nm 정규화: 공백/NBSP 제거 → 괄호 접미사 제거 → 희석 병기 제거."""
    nm = nm.replace(" ", "").replace(" ", "")
    nm = re.sub(r"\([^)]*\)$", "", nm)
    nm = nm.replace("/희석", "").replace("및희석", "")
    return nm


def _eps_fallback(items: list) -> tuple:
    """EPS 폴백 추출 (Tier 2/3).

    Tier 2: FromContinuingOperations + FromDiscontinuedOperations 합산.
            중단영업 값이 없으면 계속영업 단독 사용.
    Tier 3: account_nm 정규화 후 보통주 기본 EPS 패턴 매칭.
            공백·희석병기·괄호접미사 정규화로 유형 A/C 모두 대응.

    반환: (value: int | None, reason: str)
    """
    # Tier 2 — 계속/중단영업 분리 공시
    cont_val, cont_prio = None, 999
    disc_val, disc_prio = None, 999
    for item in items:
        aid = item.get("account_id", "")
        if aid not in (_AID_EPS_CONT, _AID_EPS_DISC):
            continue
        raw = item.get("thstrm_amount", "").replace(",", "").strip()
        try:
            value = float(raw) if raw else None
        except ValueError:
            value = None
        if value is None:
            continue
        prio = _EPS_DIV_PRIO.get(item.get("sj_div", ""), 999)
        if aid == _AID_EPS_CONT and prio < cont_prio:
            cont_val, cont_prio = value, prio
        elif aid == _AID_EPS_DISC and prio < disc_prio:
            disc_val, disc_prio = value, prio
    if cont_val is not None:
        total = cont_val + (disc_val or 0)
        return total, f"Tier2 Continuing({cont_val})+Discontinued({disc_val or 0})"

    # Tier 3 — account_nm 정규화 매칭
    best_val, best_prio, best_nm = None, 999, None
    for item in items:
        normalized = _normalize_eps_nm(item.get("account_nm", ""))
        if normalized not in _EPS_NM_TARGETS:
            continue
        raw = item.get("thstrm_amount", "").replace(",", "").strip()
        try:
            value = float(raw) if raw else None
        except ValueError:
            value = None
        if value is None:
            continue
        prio = _EPS_DIV_PRIO.get(item.get("sj_div", ""), 999)
        if prio < best_prio:
            best_val, best_prio, best_nm = value, prio, item.get("account_nm")
    if best_val is not None:
        return best_val, f"Tier3 account_nm='{best_nm}'"

    return None, ""


def get_existing_keys(cursor) -> set[tuple]:
    """DB에 이미 적재된 (ticker, year, quarter, report_type) 집합 반환."""
    cursor.execute(
        "SELECT ticker, year, quarter, report_type FROM financial_statements"
    )
    return {(row[0], row[1], row[2], row[3]) for row in cursor.fetchall()}


def _parse_financial_list(items: list) -> dict:
    """DART list 항목에서 TARGET_ACCOUNTS 값을 추출한다.

    우선순위:
      1. account_id: _PREFERRED_ACCOUNTS에 선호 account_id가 있으면 해당 값을 우선 사용.
         선호 account_id로 적재된 이후엔 폴백 account_id 값을 무시한다.
      2. sj_div: _PREFERRED_SJ_DIV에 선호 구분이 있으면 그 값을 우선 사용.
         동일 account_id 티어 내에서만 적용된다.
    """
    result: dict = {}
    result_preferred_div: set = set()  # sj_div 기준 선호 달성 여부
    result_preferred_account: set = set()  # account_id 기준 선호 달성 여부
    for item in items:
        account_id = item.get("account_id", "")
        if account_id not in TARGET_ACCOUNTS:
            continue
        key = TARGET_ACCOUNTS[account_id]
        raw = item.get("thstrm_amount", "").replace(",", "").strip()
        try:
            value = float(raw) if raw else None
        except ValueError:
            value = None

        sj_div = item.get("sj_div", "")
        preferred_div = _PREFERRED_SJ_DIV.get(key)
        is_preferred_div = preferred_div is not None and sj_div == preferred_div

        preferred_account = _PREFERRED_ACCOUNTS.get(key)
        is_preferred_account = (
            preferred_account is not None and account_id == preferred_account
        )

        # 선호 account_id가 이미 적재됐으면 폴백 account_id 값은 무시
        if key in result_preferred_account and not is_preferred_account:
            continue

        if key not in result:
            result[key] = value
            if is_preferred_div:
                result_preferred_div.add(key)
            if is_preferred_account:
                result_preferred_account.add(key)
        elif is_preferred_account and key not in result_preferred_account:
            # 폴백 account_id 값이 먼저 들어왔던 경우 → 선호 account_id로 교체
            result[key] = value
            result_preferred_account.add(key)
            result_preferred_div.discard(key)
            if is_preferred_div:
                result_preferred_div.add(key)
        elif is_preferred_div and key not in result_preferred_div:
            # 동일 account_id 티어 내에서 선호 sj_div로 교체
            result[key] = value
            result_preferred_div.add(key)

    # EPS 폴백 (Tier 2/3): ifrs-full_BasicEarningsLossPerShare 미공시 종목 대응
    if "eps" not in result:
        eps_val, reason = _eps_fallback(items)
        if eps_val is not None:
            result["eps"] = eps_val
            logger.debug("EPS 폴백 적용: %s", reason)

    return result


def fetch_financial(
    corp_code: str, bsns_year: str, reprt_code: str, ticker: Optional[str] = None
) -> tuple[Optional[dict], bool]:
    """반환 (data, no_data). no_data 는 CFS·OFS 모두 DART 가 '조회된 데이터 없음'(013)을
    확정한 경우만 True — 요청 예외·다른 status·빈 파싱은 일시 실패일 수 있어 비공시 근거가 아니다."""
    url = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    base_params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": reprt_code,
    }

    statuses = []
    for fs_div in ("CFS", "OFS"):
        params = {**base_params, "fs_div": fs_div}
        try:
            res = requests.get(url, params=params, timeout=10)
            data = res.json()
        except Exception as e:
            logger.error("DART 요청 실패 %s: %s", corp_code, e)
            return None, False

        if data.get("status") == "000":
            break
        statuses.append(data.get("status"))

        if fs_div == "CFS":
            # info 로 남겨 Actions 로그에서 OFS(별도) 종목을 집계할 수 있게 한다
            logger.info(
                "[OFS_FALLBACK] ticker=%s period=%s/%s corp_code=%s — CFS 응답 없음",
                ticker,
                bsns_year,
                reprt_code,
                corp_code,
            )
            time.sleep(0.05)
    else:
        return None, statuses == [DART_NO_DATA, DART_NO_DATA]

    result = _parse_financial_list(data["list"])
    if not result:
        return None, False
    # 게이트 로그용 rcept_no 주입 (SQL 바인딩은 명시 컬럼만 참조하므로 무시됨)
    items = data.get("list") or []
    result["_rcept_no"] = items[0].get("rcept_no") if items else None
    # 표시통화 검사 — TARGET_ACCOUNTS 매칭 item 중 KRW 가 아닌 것이 있으면 마킹.
    # insert_financial 에서 게이트로 사용. _currencies 는 매칭 item 의 통화 전체 집합 —
    # 격리 게이트(단일 통화 확인)와 known 종목의 통화 미표기 판정에 쓴다.
    currencies: set[str] = set()
    for it in items:
        if it.get("account_id") not in TARGET_ACCOUNTS:
            continue
        cur = (it.get("currency") or "").strip().upper()
        if not cur:
            continue
        currencies.add(cur)
        if cur != EXPECTED_CURRENCY and "_non_krw_currency" not in result:
            result["_non_krw_currency"] = cur
    result["_currencies"] = currencies
    return result, False


def get_shares(cursor, ticker: str) -> Optional[int]:
    """stocks 테이블에서 상장주식수(KRX LIST_SHRS)를 조회한다."""
    cursor.execute("SELECT shares FROM stocks WHERE ticker = %s", (ticker,))
    row = cursor.fetchone()
    if row and row[0] and row[0] > 0:
        return row[0]
    return None


def compute_bps(total_equity, shares) -> Optional[Decimal]:
    """round(total_equity / shares, 4). 반올림은 기존 SQL 재계산(ROUND numeric)과 같은 half-up.
    지분 없음(격리된 non-KRW 행 포함)·shares 없음이면 None."""
    if total_equity is None or not shares or shares <= 0:
        return None
    return (Decimal(total_equity) / Decimal(shares)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


def plan_bps_sync(rows) -> list[tuple[int, Decimal]]:
    """rows: (id, total_equity, bps, shares). 현재 shares 로 계산한 값과 저장값이 다른 행만.

    bps 는 저장값이라 shares 가 바뀌면(병합·분할·소각, KRX 일일 갱신) 스스로 따라오지 않는다.
    NULL 은 "다름"에 포함 — 적재 시점에 shares 가 없던 행도 같은 경로로 채운다.
    """
    targets = []
    for row_id, total_equity, bps, shares in rows:
        new = compute_bps(total_equity, shares)
        if new is not None and bps != new:
            targets.append((row_id, new))
    return targets


def sync_bps(cursor) -> int:
    """전 행 bps 를 현재 stocks.shares 에 맞춘다. commit 은 호출부 몫. 갱신 행 수 반환."""
    cursor.execute(
        """
        SELECT f.id, f.total_equity, f.bps, s.shares
        FROM financial_statements f
        JOIN stocks s ON s.ticker = f.ticker
        WHERE f.total_equity IS NOT NULL AND s.shares > 0
        """
    )
    targets = plan_bps_sync(cursor.fetchall())
    if targets:
        execute_values(
            cursor,
            "UPDATE financial_statements AS f SET bps = v.bps "
            "FROM (VALUES %s) AS v(id, bps) WHERE f.id = v.id",
            targets,
            template="(%s, %s::numeric)",
            page_size=BPS_UPDATE_PAGE_SIZE,
        )
    return len(targets)


def _check_value_cap(data: dict) -> Optional[tuple[str, float]]:
    """수치 컬럼 중 |값| ≥ ABS_VALUE_CAP 인 첫 항목 반환. 없으면 None."""
    for col in _GATE_COLS:
        v = data.get(col)
        if v is None:
            continue
        try:
            if abs(float(v)) >= ABS_VALUE_CAP:
                return col, float(v)
        except (TypeError, ValueError):
            continue
    return None


def insert_financial(
    conn,
    cursor,
    ticker: str,
    corp_code: str,
    bsns_year: str,
    reprt_code: str,
    data: dict,
    known_non_krw: Optional[dict[str, str]] = None,
) -> str:
    """
    반환값 규약:
      "ok"         : 적재 성공
      "gate_skip"  : sanity 게이트(신규 non-KRW·부풀림) skip — 신규 non-KRW 는 호출측이
                     격리를 시도하고, 격리까지 거절되면 exit code 기여
      "known_skip" : 등록된 non-KRW 티커 skip — 로그만, exit code 미기여
      "error"      : DB 오류
    known_non_krw 는 stocks.reporting_currency 가 KRW 가 아닌 종목 → 통화 (get_non_krw_tickers).
    """
    known_non_krw = known_non_krw or {}
    # 표시통화 게이트 — 비-KRW filing 은 skip. KRW 원 단위 저장 전제 위반 방지.
    non_krw = data.get("_non_krw_currency")
    # 등록된 non-KRW 종목인데 통화가 아예 표기되지 않은 공시는 KRW 복귀 근거가 못 된다 —
    # 외화 금액을 원 단위로 적재하는 사고를 막기 위해 known skip 으로 둔다.
    if not non_krw and ticker in known_non_krw and not data.get("_currencies"):
        non_krw = "?"
    if non_krw:
        if ticker in known_non_krw:
            logger.warning(
                "[NON_KRW_KNOWN] ticker=%s period=%s/%s currency=%s rcept_no=%s",
                ticker,
                bsns_year,
                reprt_code,
                non_krw,
                data.get("_rcept_no"),
            )
            return "known_skip"
        logger.warning(
            "[NON_KRW_SKIP] ticker=%s period=%s/%s currency=%s rcept_no=%s",
            ticker,
            bsns_year,
            reprt_code,
            non_krw,
            data.get("_rcept_no"),
        )
        return "gate_skip"

    # 부풀림 sanity 게이트 — 자동 정정 없음, skip 만.
    breach = _check_value_cap(data)
    if breach is not None:
        col, val = breach
        logger.warning(
            "[VALUE_CAP_SKIP] ticker=%s period=%s/%s col=%s value=%s cap=%s rcept_no=%s",
            ticker,
            bsns_year,
            reprt_code,
            col,
            f"{val:,.0f}",
            f"{ABS_VALUE_CAP:,.0f}",
            data.get("_rcept_no"),
        )
        return "gate_skip"

    total_equity = data.get("total_equity")
    bps = compute_bps(total_equity, get_shares(cursor, ticker))

    sql = """
        INSERT INTO financial_statements (
            ticker, corp_code, year, quarter, report_type,
            revenue, operating_profit, net_income,
            total_assets, total_equity,
            eps, bps
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ticker, year, quarter, report_type) DO UPDATE SET
            revenue = EXCLUDED.revenue,
            operating_profit = EXCLUDED.operating_profit,
            net_income = EXCLUDED.net_income,
            total_assets = EXCLUDED.total_assets,
            total_equity = EXCLUDED.total_equity,
            eps = EXCLUDED.eps,
            bps = EXCLUDED.bps
    """
    try:
        cursor.execute(
            sql,
            (
                ticker,
                corp_code,
                int(bsns_year),
                _QUARTER_MAP.get(reprt_code, 4),
                _REPORT_TYPE_MAP.get(reprt_code, "annual"),
                data.get("revenue"),
                data.get("operating_profit"),
                data.get("net_income"),
                data.get("total_assets"),
                total_equity,
                data.get("eps"),
                bps,
            ),
        )
        conn.commit()
    except _DB_RETRY_EXC:
        # connection 절단류 — caller 가 재연결·재시도 결정. rollback 시도하지 않음
        # (죽은 conn 에서 rollback 이 새 예외를 유발할 수 있음).
        raise
    except Exception as e:
        logger.error("DB 적재 실패 %s (%s/%s): %s", ticker, bsns_year, reprt_code, e)
        conn.rollback()
        return "error"

    return "ok"


def is_collect_target(is_financial_filer, listed_at, today) -> bool:
    """비공시 마킹 종목은 상장 NON_FILER_RETRY_DAYS 이내(또는 상장일 미상)일 때만 다시 조회."""
    if is_financial_filer is not False:
        return True
    return listed_at is None or (today - listed_at).days <= NON_FILER_RETRY_DAYS


def get_all_corps(cursor, today=None) -> list[tuple[str, str, str]]:
    today = today or datetime.today().date()
    cursor.execute(
        """
        SELECT ticker, corp_code, name, is_financial_filer, listed_at FROM stocks
        WHERE corp_code IS NOT NULL
          AND is_active = true
        """
    )
    return [
        (ticker, corp_code, name)
        for ticker, corp_code, name, filer, listed_at in cursor.fetchall()
        if is_collect_target(filer, listed_at, today)
    ]


def get_non_krw_tickers(cursor) -> dict[str, str]:
    """stocks.reporting_currency 가 KRW 가 아닌 종목 → 통화. known skip 과 격리 게이트의 기준."""
    cursor.execute(
        "SELECT ticker, reporting_currency FROM stocks WHERE reporting_currency <> %s",
        (EXPECTED_CURRENCY,),
    )
    return {row[0]: row[1] for row in cursor.fetchall()}


_PERIOD_ORDER = ("11013", "11012", "11014", "11011")  # Q1 → Q2 → Q3 → 사업보고서


def prev_period(bsns_year: str, reprt_code: str) -> tuple[str, str]:
    """직전 정기보고서 period. Q1 의 직전은 전년 사업보고서."""
    idx = _PERIOD_ORDER.index(reprt_code)
    if idx == 0:
        return str(int(bsns_year) - 1), _PERIOD_ORDER[-1]
    return bsns_year, _PERIOD_ORDER[idx - 1]


def _dump_json(path: str, obj) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, default=str)


def _reopen(conn, cursor):
    """connection 절단 뒤 재연결. get_connection 이 다시 실패하면 raise 로 스크립트 중단."""
    for obj in (cursor, conn):
        try:
            obj.close()
        except Exception:
            pass
    conn = get_connection()
    return conn, conn.cursor()


class NonKrwRun:
    """run 전체가 공유하는 격리 상태 — 남은 상한 · 산출물 디렉토리 · summary 항목."""

    def __init__(self, stamp: str, run_id: Optional[str]):
        self.stamp = stamp
        self.run_id = run_id
        self.remaining = MAX_NON_KRW_ISOLATIONS_PER_RUN
        self.out_dir = os.path.join(NON_KRW_OUT_ROOT, stamp)
        self.entries: list[dict] = []

    def dump_summary(self) -> None:
        """격리 시도가 1건이라도 있을 때만 summary.json 을 남긴다 (없으면 디렉토리도 없음)."""
        if not self.entries:
            return
        os.makedirs(self.out_dir, exist_ok=True)
        _dump_json(
            os.path.join(self.out_dir, "summary.json"),
            {"run_id": self.run_id, "stamp": self.stamp, "events": self.entries},
        )


def decide_non_krw_isolation(
    cursor,
    ticker: str,
    corp_code: str,
    bsns_year: str,
    reprt_code: str,
    data: dict,
    state: NonKrwRun,
) -> tuple[Optional[str], str]:
    """격리 게이트 — 통과면 (통화, ""), 거절이면 (None, 사유). DB 쓰기 없음."""
    currencies = set(data.get("_currencies") or ())
    if len(currencies) != 1:
        return None, f"통화 혼재 {sorted(currencies)}"
    currency = next(iter(currencies))
    if state.remaining <= 0:
        return None, f"run 상한 {MAX_NON_KRW_ISOLATIONS_PER_RUN}건 초과"
    py, pr = prev_period(bsns_year, reprt_code)
    prev_data, prev_no_data = fetch_financial(corp_code, py, pr, ticker=ticker)
    cursor.execute("SELECT count(*) FROM financial_statements WHERE ticker = %s", (ticker,))
    n_rows = cursor.fetchone()[0]
    if prev_data is None:
        if prev_no_data and n_rows == 0:
            return currency, ""  # 첫 정기보고서 · 적재 이력 없음 — NULL 대상이 없다
        return None, f"직전 period {py}/{pr} 조회 실패 또는 미공시 (적재 이력 {n_rows}행)"
    prev_currencies = set(prev_data.get("_currencies") or ())
    if prev_currencies != {currency}:
        return None, f"직전 period {py}/{pr} 통화 {sorted(prev_currencies)} ≠ {currency}"
    return currency, ""


def render_isolation_sql(ticker: str, currency: str, n_rows: int) -> str:
    """web/sql 격리 선례(financial_statements_non_krw_isolation.sql)와 같은 블록 — 검증 SELECT ·
    BEGIN/UPDATE/COMMIT. 추적용 산출물에 그대로 쓴다."""
    null_cols = ",\n    ".join(f"{c:<16} = NULL" for c in _ISOLATE_COLS)
    all_null = " AND ".join(f"{c} IS NULL" for c in _ISOLATE_COLS)
    return (
        f"-- ── 검증 SELECT (기대: rows = {n_rows}) ──\n"
        f"SELECT count(*) AS rows,\n"
        f"       count(*) FILTER (WHERE {all_null}) AS all_null\n"
        f"FROM financial_statements WHERE ticker = '{ticker}';\n"
        f"\n"
        f"BEGIN;\n"
        f"\n"
        f"UPDATE financial_statements\n"
        f"SET {null_cols}\n"
        f"WHERE ticker = '{ticker}';\n"
        f"-- 예상 UPDATE 카운트: {n_rows}\n"
        f"\n"
        f"UPDATE stocks\n"
        f"SET reporting_currency = '{currency}', reporting_currency_at = now()\n"
        f"WHERE ticker = '{ticker}' AND reporting_currency = '{EXPECTED_CURRENCY}';\n"
        f"-- 예상 UPDATE 카운트: 1\n"
        f"\n"
        f"COMMIT;\n"
    )


def isolate_non_krw(
    conn, cursor, ticker: str, currency: str, state: NonKrwRun, header: str
) -> tuple[bool, str]:
    """트랜잭션 1개로 격리 → (적용 여부, 요약 또는 사유). SELECT … FOR UPDATE 스냅샷을 before.json 으로
    남긴 뒤 수치 NULL · stocks.reporting_currency 갱신. rowcount 가 어긋나면 ROLLBACK.
    connection 절단류는 그대로 올린다(호출측 재연결)."""
    cols = ["id", "year", "quarter", "report_type", *_ISOLATE_COLS]
    try:
        cursor.execute(
            f"SELECT {', '.join(cols)} FROM financial_statements "
            "WHERE ticker = %s ORDER BY year, quarter FOR UPDATE",
            (ticker,),
        )
        rows = cursor.fetchall()
        os.makedirs(state.out_dir, exist_ok=True)
        _dump_json(
            os.path.join(state.out_dir, f"{ticker}_before.json"),
            [dict(zip(cols, r)) for r in rows],
        )
        cursor.execute(
            "UPDATE financial_statements SET "
            + ", ".join(f"{c} = NULL" for c in _ISOLATE_COLS)
            + " WHERE ticker = %s",
            (ticker,),
        )
        if cursor.rowcount != len(rows):
            conn.rollback()
            return False, f"UPDATE {cursor.rowcount} ≠ {len(rows)}"
        cursor.execute(
            "UPDATE stocks SET reporting_currency = %s, reporting_currency_at = now() "
            "WHERE ticker = %s AND reporting_currency = %s",
            (currency, ticker, EXPECTED_CURRENCY),
        )
        if cursor.rowcount != 1:
            conn.rollback()
            return False, f"stocks 갱신 {cursor.rowcount}행 (reporting_currency 가 KRW 가 아님)"
        conn.commit()
    except _DB_RETRY_EXC:
        raise
    except Exception as e:
        conn.rollback()
        return False, f"예외 {e!r}"
    with open(os.path.join(state.out_dir, f"isolate_{ticker}.sql"), "w", encoding="utf-8") as f:
        f.write(header + render_isolation_sql(ticker, currency, len(rows)))
    return True, f"rows={len(rows)}"


def try_isolate_non_krw(
    conn,
    cursor,
    ticker: str,
    corp_code: str,
    bsns_year: str,
    reprt_code: str,
    data: dict,
    known_non_krw: dict[str, str],
    state: NonKrwRun,
) -> bool:
    """신규 non-KRW 발견 처리 — 게이트를 전부 통과한 건만 격리·등록. 로그·summary 에 남기고 적용 여부 반환."""
    period = f"{bsns_year}/{reprt_code}"
    rcept_no = data.get("_rcept_no")
    currency, note = decide_non_krw_isolation(
        cursor, ticker, corp_code, bsns_year, reprt_code, data, state
    )
    applied = False
    if currency is None:
        conn.rollback()  # 게이트의 SELECT 로 열린 트랜잭션 정리
    else:
        header = (
            f"-- fetch_financials.py 생성 · {state.stamp} · run {state.run_id or 'local'}\n"
            f"-- {ticker} 표시통화 {currency} — {period} 공시(rcept_no {rcept_no})에서 발견.\n"
            f"-- 같은 블록을 run 안에서 한 트랜잭션으로 적용했다. 추적용 기록 — 다시 돌리지 말 것.\n"
            f"-- 원복은 stocks.reporting_currency 를 KRW 로 되돌린 뒤 {ticker}_before.json 의 값으로 UPDATE.\n\n"
        )
        applied, note = isolate_non_krw(conn, cursor, ticker, currency, state, header)
    if applied:
        known_non_krw[ticker] = currency
        state.remaining -= 1
        logger.warning(
            "[NON_KRW_ISOLATED] ticker=%s period=%s currency=%s %s rcept_no=%s",
            ticker, period, currency, note, rcept_no,
        )
    else:
        logger.error(
            "[NON_KRW_DECLINED] ticker=%s period=%s currency=%s rcept_no=%s — %s",
            ticker, period, data.get("_non_krw_currency"), rcept_no, note,
        )
    state.entries.append(
        {
            "ticker": ticker,
            "period": period,
            "rcept_no": rcept_no,
            "currency": currency or data.get("_non_krw_currency"),
            "status": "isolated" if applied else "declined",
            "note": note,
        }
    )
    return applied


def update_known_currency(conn, cursor, ticker: str, known_non_krw: dict[str, str], data: dict) -> None:
    """등록 종목의 공시 통화가 등록값과 다르면(CNY→USD 전환 등) 컬럼만 따라 바꾼다 — 격리는 이미 돼 있다."""
    currencies = set(data.get("_currencies") or ())
    if len(currencies) != 1:
        return
    new = next(iter(currencies))
    if new == EXPECTED_CURRENCY or new == known_non_krw.get(ticker):
        return
    try:
        cursor.execute(
            "UPDATE stocks SET reporting_currency = %s, reporting_currency_at = now() WHERE ticker = %s",
            (new, ticker),
        )
        conn.commit()
    except _DB_RETRY_EXC:
        raise
    except Exception as e:
        conn.rollback()
        logger.error("reporting_currency 갱신 실패 %s: %s", ticker, e)
        return
    logger.warning(
        "[NON_KRW_CURRENCY_CHANGE] ticker=%s %s → %s", ticker, known_non_krw.get(ticker), new
    )
    known_non_krw[ticker] = new


def mark_non_filer(conn, cursor, ticker: str, name: str) -> None:
    """DART 가 데이터 없음(013)을 확정한 종목을 is_financial_filer = false로 표시.
    적재 이력이 전혀 없는 종목에만 호출할 것.
    """
    try:
        # 재시도 대상은 이미 false 인 채로 매 run 다시 오므로 첫 마킹만 기록한다.
        cursor.execute(
            "UPDATE stocks SET is_financial_filer = false "
            "WHERE ticker = %s AND is_financial_filer IS DISTINCT FROM false",
            (ticker,),
        )
        marked = cursor.rowcount > 0
        conn.commit()
        if marked:
            logger.info(
                "[MARK] %s (%s) → is_financial_filer=false (DART 미공시 확인)", ticker, name
            )
    except _DB_RETRY_EXC:
        raise
    except Exception as e:
        logger.error("is_financial_filer 업데이트 실패 %s: %s", ticker, e)
        conn.rollback()


def restore_filers(cursor) -> int:
    """적재 이력이 생긴 비공시 마킹 종목을 true 로 되돌린다. commit 은 호출부 몫. 복귀 종목 수 반환.
    false 는 '적재 이력 없음'에서만 붙으므로, 재시도로 적재되면 그 전제가 깨진다."""
    cursor.execute(
        """
        UPDATE stocks s SET is_financial_filer = true
        WHERE s.is_financial_filer = false
          AND EXISTS (SELECT 1 FROM financial_statements f WHERE f.ticker = s.ticker)
        """
    )
    return cursor.rowcount


def check_unit_suspects(cursor) -> None:
    """단위 불일치 사후 스캔 (경고 로그만, 자동 정정 없음).

    두 룰을 순차 검사한다:
      (1) annual / SUM(quarter) revenue 비율 > 10
          한국 분기 revenue 는 누적값이라 정상 비율 ~0.67. 비율 > 10 은
          annual 과 분기 간 unit 오태그(원/천원/백만원) 의심.
      (2) 분기 단독 어떤 수치 컬럼이라도 |값| ≥ ABS_VALUE_CAP
          insert 게이트가 놓쳤을 기존 DB 잔존 부풀림 검출 (예: 007720
          2024 Q3, 060310 2022 Q3 등 분기 단독 부풀림 케이스).
    """
    # (1) annual/qsum 비율
    cursor.execute(
        """
        WITH annual AS (
            SELECT ticker, year, revenue AS annual_rev
            FROM financial_statements
            WHERE report_type = 'annual' AND revenue IS NOT NULL
        ),
        quarterly AS (
            SELECT ticker, year, SUM(revenue) AS q_sum, COUNT(*) AS q_cnt
            FROM financial_statements
            WHERE report_type = 'quarter' AND revenue IS NOT NULL
            GROUP BY ticker, year
        )
        SELECT a.ticker, a.year, q.q_sum, a.annual_rev,
               a.annual_rev::float / q.q_sum AS ratio
        FROM annual a
        JOIN quarterly q ON a.ticker = q.ticker AND a.year = q.year
        WHERE q.q_cnt >= 3
          AND q.q_sum > 0
          AND a.annual_rev::float / q.q_sum > 10
        ORDER BY ratio DESC
        """
    )
    ratio_rows = cursor.fetchall()
    suppressed = 0
    reported = 0
    for ticker, year, q_sum, annual_rev, ratio in ratio_rows:
        if (ticker, year) in CHECKED_UNIT_SUSPECTS:
            suppressed += 1
            continue
        logger.warning(
            "[UNIT_SUSPECT] ticker=%s year=%d q_sum=%s annual=%s ratio=%.2f",
            ticker,
            year,
            f"{q_sum:,}",
            f"{annual_rev:,}",
            ratio,
        )
        reported += 1
    if reported:
        logger.info("[UNIT_SUSPECT] 비율 의심 %d건", reported)
    if suppressed:
        logger.info("[UNIT_SUSPECT] checked 억제 %d건", suppressed)

    # (2) 분기 단독 |값| ≥ CAP (insert 게이트 이전 잔존분 검출)
    cap_int = int(ABS_VALUE_CAP)
    cursor.execute(
        """
        SELECT ticker, year, quarter, report_type,
               revenue, operating_profit, net_income, total_assets, total_equity
        FROM financial_statements
        WHERE report_type = 'quarter'
          AND (ABS(revenue::numeric) >= %s
            OR ABS(operating_profit::numeric) >= %s
            OR ABS(net_income::numeric) >= %s
            OR ABS(total_assets::numeric) >= %s
            OR ABS(total_equity::numeric) >= %s)
        ORDER BY ticker, year, quarter
        """,
        (cap_int, cap_int, cap_int, cap_int, cap_int),
    )
    cap_rows = cursor.fetchall()
    for row in cap_rows:
        t, y, q, rt, rev, op, ni, ta, te = row
        logger.warning(
            "[UNIT_SUSPECT_CAP] ticker=%s %s Q%s rev=%s op=%s ni=%s ta=%s te=%s (cap=%s)",
            t, y, q,
            f"{rev:,}" if rev is not None else "NULL",
            f"{op:,}" if op is not None else "NULL",
            f"{ni:,}" if ni is not None else "NULL",
            f"{ta:,}" if ta is not None else "NULL",
            f"{te:,}" if te is not None else "NULL",
            f"{ABS_VALUE_CAP:,.0f}",
        )
    if cap_rows:
        logger.info("[UNIT_SUSPECT_CAP] 분기 단독 CAP 위반 %d건", len(cap_rows))


def run(
    bsns_year: str,
    reprt_code: str,
    existing_keys: set[tuple],
    force: bool = False,
    ticker_filter: Optional[set] = None,
    known_non_krw: Optional[dict[str, str]] = None,
    non_krw_state: Optional[NonKrwRun] = None,
) -> Optional[tuple[int, int, int, int, int]]:
    """반환값: (cap_skip, known_skip, new_non_krw_skip, value_cap_skip, isolated).
    cap_skip = new_non_krw_skip + value_cap_skip 이며, 호출측의 exit 판정에 사용.
    known_skip·isolated 는 알람 노이즈 억제 대상이라 cap_skip 에 포함하지 않는다.
    new_non_krw_skip 은 격리까지 거절된 건만 센다 (non_krw_state 가 None 이면 전부).
    종목 목록 조회 실패는 None — 대상 0종목과 구분해 호출측 exit 판정에 쓴다.
    """
    known_non_krw = {} if known_non_krw is None else known_non_krw
    conn = get_connection()
    cursor = conn.cursor()
    try:
        corps = get_all_corps(cursor)
    except Exception as e:
        logger.error("종목 목록 조회 실패 (%s/%s): %s", bsns_year, reprt_code, e)
        cursor.close()
        conn.close()
        return None

    if ticker_filter is not None:
        corps = [(t, c, n) for t, c, n in corps if t in ticker_filter]

    total = len(corps)
    quarter = _QUARTER_MAP.get(reprt_code, 4)
    report_type = _REPORT_TYPE_MAP.get(reprt_code, "annual")
    filed_tickers = {key[0] for key in existing_keys}
    logger.info(
        "재무제표 적재 시작: %s Q%s (%s) — 총 %d개 종목",
        bsns_year,
        quarter,
        reprt_code,
        total,
    )

    success, skip, error = 0, 0, 0
    # cap_skip = new_non_krw_skip + value_cap_skip (exit 기여). known_skip·isolated 는 별도.
    new_non_krw_skip, value_cap_skip, known_skip, isolated = 0, 0, 0, 0

    for i, (ticker, corp_code, name) in enumerate(corps, 1):
        # period 내부 루프에서 일정 간격마다 커넥션 재생성 (연속 스킵 시 Neon SSL 타임아웃 방지)
        if i > 1 and (i - 1) % RECONNECT_EVERY == 0:
            cursor.close()
            conn.close()
            conn = get_connection()
            cursor = conn.cursor()
            logger.info("[RECONNECT] %s Q%s — %d번째 iteration", bsns_year, quarter, i)

        key = (ticker, int(bsns_year), quarter, report_type)

        if key in existing_keys:
            logger.debug("이미 적재됨 스킵: %s %s Q%s", ticker, bsns_year, quarter)
            skip += 1
            continue

        data, no_data = fetch_financial(corp_code, bsns_year, reprt_code, ticker=ticker)

        if data is None:
            logger.debug(
                "DART 응답 없음 (no_data=%s): %s %s/%s", no_data, ticker, bsns_year, reprt_code
            )
            if no_data and not force and ticker not in filed_tickers:
                try:
                    mark_non_filer(conn, cursor, ticker, name)
                except _DB_RETRY_EXC:
                    # 연결 절단 감지 → 재연결 후 이 종목 1회 재시도.
                    # get_connection 이 다시 실패하면 raise 로 스크립트 중단.
                    logger.warning("[WARN] DB 재연결 후 재시도: %s", ticker)
                    try:
                        cursor.close()
                    except Exception:
                        pass
                    try:
                        conn.close()
                    except Exception:
                        pass
                    conn = get_connection()
                    cursor = conn.cursor()
                    try:
                        mark_non_filer(conn, cursor, ticker, name)
                    except _DB_RETRY_EXC as e2:
                        logger.error("[%s] DB 재시도 실패, 스킵: %s", ticker, e2)
                        error += 1
                        time.sleep(0.05)
                        continue
            skip += 1
            time.sleep(0.05)
        else:
            try:
                result = insert_financial(
                    conn, cursor, ticker, corp_code, bsns_year, reprt_code, data,
                    known_non_krw=known_non_krw,
                )
            except _DB_RETRY_EXC:
                logger.warning("[WARN] DB 재연결 후 재시도: %s", ticker)
                try:
                    cursor.close()
                except Exception:
                    pass
                try:
                    conn.close()
                except Exception:
                    pass
                conn = get_connection()
                cursor = conn.cursor()
                try:
                    result = insert_financial(
                        conn, cursor, ticker, corp_code, bsns_year, reprt_code, data,
                        known_non_krw=known_non_krw,
                    )
                except _DB_RETRY_EXC as e2:
                    logger.error("[%s] DB 재시도 실패, 스킵: %s", ticker, e2)
                    error += 1
                    time.sleep(0.15)
                    continue
            if result == "ok":
                existing_keys.add(key)
                success += 1
            elif result == "known_skip":
                known_skip += 1
                try:
                    update_known_currency(conn, cursor, ticker, known_non_krw, data)
                except _DB_RETRY_EXC as e:
                    logger.warning("[WARN] 통화 갱신 중 연결 절단, 다음 run 에 맡김: %s (%s)", ticker, e)
                    conn, cursor = _reopen(conn, cursor)
            elif result == "gate_skip":
                # sub-bucket 판정 — insert_financial 는 두 케이스 모두 "gate_skip"
                # 반환(관측 연속성 유지)이므로 data 플래그로 구분한다.
                if data.get("_non_krw_currency"):
                    applied = False
                    if non_krw_state is not None:
                        try:
                            applied = try_isolate_non_krw(
                                conn, cursor, ticker, corp_code, bsns_year, reprt_code,
                                data, known_non_krw, non_krw_state,
                            )
                        except _DB_RETRY_EXC as e:
                            logger.error("[NON_KRW_DECLINED] ticker=%s — 격리 중 연결 절단 %s", ticker, e)
                            conn, cursor = _reopen(conn, cursor)
                    if applied:
                        isolated += 1
                    else:
                        new_non_krw_skip += 1
                else:
                    value_cap_skip += 1
            else:  # "error"
                error += 1
            time.sleep(0.15)

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 게이트skip=%d, known=%d, 격리=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                new_non_krw_skip + value_cap_skip,
                known_skip,
                isolated,
                error,
            )

    cap_skip = new_non_krw_skip + value_cap_skip
    logger.info(
        "완료 %s Q%s: 성공=%d, 스킵=%d, 게이트skip=%d(신규 non-KRW=%d, VALUE_CAP=%d), known=%d, 격리=%d, 오류=%d",
        bsns_year,
        quarter,
        success,
        skip,
        cap_skip,
        new_non_krw_skip,
        value_cap_skip,
        known_skip,
        isolated,
        error,
    )
    cursor.close()
    conn.close()
    return cap_skip, known_skip, new_non_krw_skip, value_cap_skip, isolated


def get_available_reports(years_back: int = 5) -> list[tuple[str, str]]:
    """
    현재 날짜 기준으로 이미 공시된 (bsns_year, reprt_code) 목록 반환.

    DART 공시 일정 기준:
      Q1  (11013) : 해당 연도 5월 이후 공시
      Q2  (11012) : 해당 연도 8월 이후 공시
      Q3  (11014) : 해당 연도 11월 이후 공시
      Q4  (11011) : 다음 연도 4월 이후 공시 (사업보고서)
    """
    today = datetime.today()
    y, m = today.year, today.month

    reports = []
    for year in range(y - years_back, y + 1):
        if year < y or m >= 5:
            reports.append((str(year), "11013"))  # Q1
        if year < y or m >= 8:
            reports.append((str(year), "11012"))  # Q2
        if year < y or m >= 11:
            reports.append((str(year), "11014"))  # Q3
        if year < y - 1 or (year == y - 1 and m >= 4):
            reports.append((str(year), "11011"))  # Q4 / 연간

    return reports


def main():
    setup_logging("financials")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--periods",
        type=int,
        default=None,
        help="순회할 최신 period 수 (기본값: 5년 전체)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="기존 적재 데이터 무시하고 전체 재적재 (upsert)",
    )
    parser.add_argument(
        "--tickers",
        type=str,
        default=None,
        metavar="FILE",
        help="처리할 ticker 목록 파일 경로 (한 줄당 ticker 하나). 미지정 시 전체 종목 처리.",
    )
    args = parser.parse_args()

    ticker_filter: Optional[set] = None
    if args.tickers is not None:
        if not os.path.isfile(args.tickers):
            logger.error("ticker 파일을 찾을 수 없습니다: %s", args.tickers)
            sys.exit(1)
        with open(args.tickers, encoding="utf-8") as f:
            ticker_filter = {line.strip() for line in f if line.strip()}
        if not ticker_filter:
            logger.error("ticker 파일이 비어 있습니다: %s", args.tickers)
            sys.exit(1)
        logger.info("ticker 필터 적용: %d개 종목", len(ticker_filter))

    reports = get_available_reports()
    if args.periods is not None:
        reports = reports[-args.periods :]
    logger.info("수집 대상 (periods=%s): %s", args.periods, reports)
    if args.force:
        answer = input(
            f"--force: 기존 {len(reports)}개 period 전체 재적재합니다. 계속하시겠습니까? (y/N): "
        )
        if answer.strip() not in ("y", "Y"):
            sys.exit(0)
    conn = get_connection()
    cursor = conn.cursor()
    if args.force:
        existing_keys = set()
        logger.info("--force 모드: existing_keys 무시, 전체 재적재")
    else:
        existing_keys = get_existing_keys(cursor)
        logger.info("기존 적재 키 수: %d", len(existing_keys))
    known_non_krw = get_non_krw_tickers(cursor)
    cursor.close()
    conn.close()
    logger.info("non-KRW 등록 종목 수: %d", len(known_non_krw))
    non_krw_state = NonKrwRun(
        datetime.now().strftime("%Y%m%d_%H%M%S"), os.getenv("GITHUB_RUN_ID")
    )
    total_cap_skip = 0
    total_known_skip = 0
    total_new_non_krw = 0
    total_value_cap = 0
    total_isolated = 0
    lookup_failed = 0
    for bsns_year, reprt_code in reports:
        result = run(
            bsns_year=bsns_year,
            reprt_code=reprt_code,
            existing_keys=existing_keys,
            force=args.force,
            ticker_filter=ticker_filter,
            known_non_krw=known_non_krw,
            non_krw_state=non_krw_state,
        )
        if result is None:
            lookup_failed += 1
            continue
        cap, known, non_krw, cap_v, isolated = result
        total_cap_skip += cap
        total_known_skip += known
        total_new_non_krw += non_krw
        total_value_cap += cap_v
        total_isolated += isolated
    non_krw_state.dump_summary()
    if total_isolated:
        logger.warning(
            "[NON_KRW_ISOLATED] %d종목 격리·등록 — %s", total_isolated, non_krw_state.out_dir
        )

    conn = get_connection()
    cursor = conn.cursor()
    try:
        logger.info("[FILER_RESTORE] %d종목 is_financial_filer=true 복귀", restore_filers(cursor))
        conn.commit()
    except Exception as e:
        logger.warning("[WARN] filer 복귀 보류 — 다음 run 에 맡김: %s", e)
        conn.rollback()
    # 이번 run 에 shares 없이 적재된 행을 채운다 — shares 변동분은 daily fetch_shares 가 맞춘다.
    try:
        logger.info("[BPS_SYNC] %d행 재계산", sync_bps(cursor))
        conn.commit()
    except Exception as e:
        logger.warning("[WARN] bps 동기화 보류 — 다음 run 에 맡김: %s", e)
        conn.rollback()
    check_unit_suspects(cursor)
    cursor.close()
    conn.close()

    # 일부 period 의 조회 실패는 exit 0 — 그 period 만 비고 나머지 적재는 유효하다.
    if lookup_failed and lookup_failed == len(reports):
        logger.error("[CORPS_LOOKUP] 전 period %d개 종목 목록 조회 실패 — 적재 0", lookup_failed)
        sys.exit(1)

    # exit 판정 — cap_skip(격리 거절 non-KRW + VALUE_CAP) 만 기여. known·격리 완료는 알람 억제.
    if total_cap_skip > 0:
        logger.error(
            "[GATE_SKIP] 격리 거절 non-KRW=%d · VALUE_CAP=%d · known=%d — [NON_KRW_DECLINED] 사유 검토, "
            "web/sql/isolate_non_krw_ticker.sql 로 수동 격리",
            total_new_non_krw,
            total_value_cap,
            total_known_skip,
        )
        sys.exit(1)
    elif total_known_skip > 0:
        logger.info(
            "[GATE_SKIP] known non-KRW %d건 (X22 전 영구 skip) — 조치 불요",
            total_known_skip,
        )


if __name__ == "__main__":
    main()
