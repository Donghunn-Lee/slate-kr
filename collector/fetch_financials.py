import logging
import os
from datetime import datetime
from dotenv import load_dotenv
from typing import Optional
import requests
import mysql.connector
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

# ── DB 연결 ────────────────────────────────────────────────
db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cursor = db.cursor()

DART_API_KEY = os.getenv("DART_API_KEY")

# 필요한 계정 항목만 추출
TARGET_ACCOUNTS = {
    "ifrs-full_Revenue": "revenue",
    "dart_OperatingIncomeLoss": "operating_profit",
    "ifrs-full_ProfitLoss": "net_income",
    "ifrs-full_Assets": "total_assets",
    "ifrs-full_Equity": "total_equity",
    "ifrs-full_BasicEarningsLossPerShare": "eps",
    # bps, dps는 DART에서 직접 제공 안 함 — 별도 처리 필요
}

_QUARTER_MAP = {"11011": 4, "11012": 2, "11013": 1, "11014": 3}
_REPORT_TYPE_MAP = {
    "11011": "annual",
    "11012": "quarter",
    "11013": "quarter",
    "11014": "quarter",
}


def get_existing_keys() -> set[tuple]:
    """DB에 이미 적재된 (ticker, year, quarter, report_type) 집합 반환."""
    cursor.execute(
        "SELECT ticker, year, quarter, report_type FROM financial_statements"
    )
    return {(row[0], row[1], row[2], row[3]) for row in cursor.fetchall()}


def fetch_financial(corp_code: str, bsns_year: str, reprt_code: str) -> Optional[dict]:
    url = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": reprt_code,
        "fs_div": "CFS",  # 연결재무제표 우선
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
    except Exception as e:
        logger.error("DART 요청 실패 %s: %s", corp_code, e)
        return None

    if data.get("status") != "000":
        return None

    result = {}
    for item in data["list"]:
        account_id = item.get("account_id", "")
        if account_id in TARGET_ACCOUNTS:
            key = TARGET_ACCOUNTS[account_id]
            raw = item.get("thstrm_amount", "").replace(",", "").strip()
            try:
                value = int(raw) if raw else None
            except ValueError:
                value = None

            if key not in result:  # 첫 번째 값만 사용
                result[key] = value

    return result if result else None


def insert_financial(
    ticker: str, corp_code: str, bsns_year: str, reprt_code: str, data: dict
) -> bool:
    """
    반환값 규약:
      True  : 적재 성공
      False : DB 오류
    """
    sql = """
        INSERT INTO financial_statements (
            ticker, corp_code, year, quarter, report_type,
            revenue, operating_profit, net_income,
            total_assets, total_equity,
            eps, bps
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            revenue=VALUES(revenue), operating_profit=VALUES(operating_profit),
            net_income=VALUES(net_income), total_assets=VALUES(total_assets),
            total_equity=VALUES(total_equity),
            eps=VALUES(eps), bps=VALUES(bps)
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
                data.get("total_equity"),
                data.get("eps"),
                data.get("bps"),
            ),
        )
        db.commit()
    except Exception as e:
        logger.error("DB 적재 실패 %s (%s/%s): %s", ticker, bsns_year, reprt_code, e)
        db.rollback()
        return False

    return True


def get_all_corps() -> list[tuple[str, str, str]]:
    cursor.execute(
        """
        SELECT ticker, corp_code, name FROM stocks
        WHERE corp_code IS NOT NULL
          AND is_active = 1
          AND (is_financial_filer = 1 OR is_financial_filer IS NULL)
        """
    )
    return cursor.fetchall()


def mark_non_filer(ticker: str, name: str) -> None:
    """DART 응답이 없는 종목을 is_financial_filer = 0으로 표시.
    적재 이력이 전혀 없는 종목에만 호출할 것.
    """
    try:
        cursor.execute(
            "UPDATE stocks SET is_financial_filer = 0 WHERE ticker = %s",
            (ticker,),
        )
        db.commit()
        logger.info(
            "[MARK] %s (%s) → is_financial_filer=0 (DART 미공시 확인)", ticker, name
        )
    except Exception as e:
        logger.error("is_financial_filer 업데이트 실패 %s: %s", ticker, e)
        db.rollback()


def run(bsns_year: str, reprt_code: str, existing_keys: set[tuple]):
    corps = get_all_corps()
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
            if ticker not in filed_tickers:
                mark_non_filer(ticker, name)
            skip += 1
        else:
            ok = insert_financial(ticker, corp_code, bsns_year, reprt_code, data)
            if ok:
                existing_keys.add(key)
                success += 1
            else:
                error += 1

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 오류=%d)",
                i,
                total,
                success,
                skip,
                error,
            )

        time.sleep(0.3)

    logger.info(
        "완료 %s Q%s: 성공=%d, 스킵=%d, 오류=%d",
        bsns_year,
        quarter,
        success,
        skip,
        error,
    )


def get_available_reports(years_back: int = 2) -> list[tuple[str, str]]:
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
    reports = get_available_reports(years_back=5)
    logger.info("수집 대상: %s", reports)
    existing_keys = get_existing_keys()
    logger.info("기존 적재 키 수: %d", len(existing_keys))
    for bsns_year, reprt_code in reports:
        run(bsns_year=bsns_year, reprt_code=reprt_code, existing_keys=existing_keys)
