import argparse
import logging
import os
import re
import sys
from datetime import datetime
from dotenv import load_dotenv
from typing import Optional
import requests
import psycopg2
import time

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"financials_{datetime.today().strftime('%Y%m%d')}.log"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
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

# 부풀림 sanity 게이트 상수 — |값| 이 이 이상이면 삽입 skip.
# 실측 정상 최대 신한지주 total_assets ≈ 8.16e14, 관측 최소 부풀림 ≈ 5.8e15
# (007720 2024 Q3 net_income). DART XBRL unit 오태그는 최소 ×1000 이라
# 정상 최대치와 최소 부풀림치 사이 경계값 2e15 로 설정.
ABS_VALUE_CAP = 2e15

# 게이트 검사 대상 컬럼 (5개 재무 수치)
_GATE_COLS = ("revenue", "operating_profit", "net_income", "total_assets", "total_equity")

# 표시통화 게이트 — DART fnlttSinglAcntAll 은 회사가 신고한 표시통화 그대로
# thstrm_amount 를 반환한다. IFRS 상 표시통화 변경(예: 241560 두산밥캣이
# 2023 사업보고서부터 KRW → USD 로 전환) 은 정당하나, 우리 파이프라인은
# KRW 원 단위 저장 전제. 비-KRW 항목이 하나라도 있으면 skip.
EXPECTED_CURRENCY = "KRW"

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


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


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


def fetch_financial(corp_code: str, bsns_year: str, reprt_code: str) -> Optional[dict]:
    url = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    base_params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": reprt_code,
    }

    for fs_div in ("CFS", "OFS"):
        params = {**base_params, "fs_div": fs_div}
        try:
            res = requests.get(url, params=params, timeout=10)
            data = res.json()
        except Exception as e:
            logger.error("DART 요청 실패 %s: %s", corp_code, e)
            return None

        if data.get("status") == "000":
            break

        if fs_div == "CFS":
            logger.debug(
                "CFS 응답 없음, OFS 폴백: %s %s/%s", corp_code, bsns_year, reprt_code
            )
            time.sleep(0.05)
    else:
        return None

    result = _parse_financial_list(data["list"])
    if not result:
        return None
    # 게이트 로그용 rcept_no 주입 (SQL 바인딩은 명시 컬럼만 참조하므로 무시됨)
    items = data.get("list") or []
    result["_rcept_no"] = items[0].get("rcept_no") if items else None
    # 표시통화 검사 — TARGET_ACCOUNTS 매칭 item 중 KRW 가 아닌 것이 있으면 마킹.
    # insert_financial 에서 게이트로 사용 (자동 정정 없음, skip 만).
    for it in items:
        if it.get("account_id") not in TARGET_ACCOUNTS:
            continue
        cur = (it.get("currency") or "").strip().upper()
        if cur and cur != EXPECTED_CURRENCY:
            result["_non_krw_currency"] = cur
            break
    return result


def get_shares(cursor, ticker: str) -> Optional[int]:
    """stocks 테이블에서 발행주식총수를 조회한다."""
    cursor.execute("SELECT shares FROM stocks WHERE ticker = %s", (ticker,))
    row = cursor.fetchone()
    if row and row[0] and row[0] > 0:
        return row[0]
    return None


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
) -> str:
    """
    반환값 규약:
      "ok"        : 적재 성공
      "gate_skip" : sanity 게이트(부풀림·비-KRW 통화) skip (자동 정정 없음)
      "error"     : DB 오류
    """
    # 표시통화 게이트 — 비-KRW filing 은 skip. KRW 원 단위 저장 전제 위반 방지.
    non_krw = data.get("_non_krw_currency")
    if non_krw:
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
    shares = get_shares(cursor, ticker)
    if total_equity is not None and shares is not None:
        bps = round(total_equity / shares, 4)
    else:
        bps = None

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
    except Exception as e:
        logger.error("DB 적재 실패 %s (%s/%s): %s", ticker, bsns_year, reprt_code, e)
        conn.rollback()
        return "error"

    return "ok"


def get_all_corps(cursor) -> list[tuple[str, str, str]]:
    cursor.execute(
        """
        SELECT ticker, corp_code, name FROM stocks
        WHERE corp_code IS NOT NULL
          AND is_active = true
          AND (is_financial_filer = true OR is_financial_filer IS NULL)
        """
    )
    return cursor.fetchall()


def mark_non_filer(conn, cursor, ticker: str, name: str) -> None:
    """DART 응답이 없는 종목을 is_financial_filer = false로 표시.
    적재 이력이 전혀 없는 종목에만 호출할 것.
    """
    try:
        cursor.execute(
            "UPDATE stocks SET is_financial_filer = false WHERE ticker = %s",
            (ticker,),
        )
        conn.commit()
        logger.info(
            "[MARK] %s (%s) → is_financial_filer=false (DART 미공시 확인)", ticker, name
        )
    except Exception as e:
        logger.error("is_financial_filer 업데이트 실패 %s: %s", ticker, e)
        conn.rollback()


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
    for ticker, year, q_sum, annual_rev, ratio in ratio_rows:
        logger.warning(
            "[UNIT_SUSPECT] ticker=%s year=%d q_sum=%s annual=%s ratio=%.2f",
            ticker,
            year,
            f"{q_sum:,}",
            f"{annual_rev:,}",
            ratio,
        )
    if ratio_rows:
        logger.info("[UNIT_SUSPECT] 비율 의심 %d건", len(ratio_rows))

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
) -> int:
    """반환값: sanity 게이트로 skip 된 건수 (호출측이 exit code 판단에 사용)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        corps = get_all_corps(cursor)
    except Exception as e:
        logger.error("종목 목록 조회 실패 (%s/%s): %s", bsns_year, reprt_code, e)
        cursor.close()
        conn.close()
        return 0

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

    success, skip, error, cap_skip = 0, 0, 0, 0

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

        data = fetch_financial(corp_code, bsns_year, reprt_code)

        if data is None:
            logger.debug(
                "DART 응답 없음 (공시 미존재): %s %s/%s", ticker, bsns_year, reprt_code
            )
            if not force and ticker not in filed_tickers:
                mark_non_filer(conn, cursor, ticker, name)
            skip += 1
            time.sleep(0.05)
        else:
            result = insert_financial(
                conn, cursor, ticker, corp_code, bsns_year, reprt_code, data
            )
            if result == "ok":
                existing_keys.add(key)
                success += 1
            elif result == "gate_skip":
                cap_skip += 1
            else:  # "error"
                error += 1
            time.sleep(0.15)

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 게이트skip=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                cap_skip,
                error,
            )

    logger.info(
        "완료 %s Q%s: 성공=%d, 스킵=%d, 게이트skip=%d, 오류=%d",
        bsns_year,
        quarter,
        success,
        skip,
        cap_skip,
        error,
    )
    cursor.close()
    conn.close()
    return cap_skip


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


if __name__ == "__main__":
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
        existing_keys = set()
        logger.info("--force 모드: existing_keys 무시, 전체 재적재")
    else:
        conn = get_connection()
        cursor = conn.cursor()
        existing_keys = get_existing_keys(cursor)
        cursor.close()
        conn.close()
        logger.info("기존 적재 키 수: %d", len(existing_keys))
    total_cap_skip = 0
    for bsns_year, reprt_code in reports:
        total_cap_skip += run(
            bsns_year=bsns_year,
            reprt_code=reprt_code,
            existing_keys=existing_keys,
            force=args.force,
            ticker_filter=ticker_filter,
        )

    conn = get_connection()
    cursor = conn.cursor()
    check_unit_suspects(cursor)
    cursor.close()
    conn.close()

    # 게이트 skip 1건 이상이면 워크플로우 실패로 표면화 (자동 정정은 없음, 수동 SQL 정책).
    if total_cap_skip > 0:
        logger.error(
            "[GATE_SKIP] 총 %d건 skip (부풀림·비-KRW 통화) — 원인 검토 후 수동 정정 SQL 실행 필요",
            total_cap_skip,
        )
        sys.exit(1)
