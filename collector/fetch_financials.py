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
            value = int(raw) if raw else None
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
            value = int(raw) if raw else None
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
            value = int(raw) if raw else None
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
    return result if result else None


def get_shares(cursor, ticker: str) -> Optional[int]:
    """stocks 테이블에서 발행주식총수를 조회한다."""
    cursor.execute("SELECT shares FROM stocks WHERE ticker = %s", (ticker,))
    row = cursor.fetchone()
    if row and row[0] and row[0] > 0:
        return row[0]
    return None


def insert_financial(
    conn,
    cursor,
    ticker: str,
    corp_code: str,
    bsns_year: str,
    reprt_code: str,
    data: dict,
) -> bool:
    """
    반환값 규약:
      True  : 적재 성공
      False : DB 오류
    """
    total_equity = data.get("total_equity")
    shares = get_shares(cursor, ticker)
    if total_equity is not None and shares is not None:
        bps = round(total_equity / shares)
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
        return False

    return True


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
    """annual / (Q1+Q2+Q3 revenue 합) > 10 인 종목을 WARNING 로그로 출력.

    한국 분기보고서 revenue는 누적값이므로 정상 비율은 ~0.67.
    비율 > 10은 annual과 분기 간 단위 불일치(원/천원/백만원) 강력 의심.
    분기 데이터가 3개 미만이면 false positive 방지를 위해 스킵.
    """
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
    rows = cursor.fetchall()
    for ticker, year, q_sum, annual_rev, ratio in rows:
        logger.warning(
            "[UNIT_SUSPECT] ticker=%s year=%d q_sum=%s annual=%s ratio=%.2f",
            ticker,
            year,
            f"{q_sum:,}",
            f"{annual_rev:,}",
            ratio,
        )
    if rows:
        logger.info("[UNIT_SUSPECT] 의심 종목 총 %d건", len(rows))


def run(
    bsns_year: str,
    reprt_code: str,
    existing_keys: set[tuple],
    force: bool = False,
    ticker_filter: Optional[set] = None,
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        corps = get_all_corps(cursor)
    except Exception as e:
        logger.error("종목 목록 조회 실패 (%s/%s): %s", bsns_year, reprt_code, e)
        cursor.close()
        conn.close()
        return set()

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
            ok = insert_financial(
                conn, cursor, ticker, corp_code, bsns_year, reprt_code, data
            )
            if ok:
                existing_keys.add(key)
                success += 1
            else:
                error += 1
            time.sleep(0.15)

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                error,
            )

    logger.info(
        "완료 %s Q%s: 성공=%d, 스킵=%d, 오류=%d",
        bsns_year,
        quarter,
        success,
        skip,
        error,
    )
    cursor.close()
    conn.close()


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
    for bsns_year, reprt_code in reports:
        run(
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
