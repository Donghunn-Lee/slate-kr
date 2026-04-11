import os
from dotenv import load_dotenv
from typing import Optional
import requests
import mysql.connector
import time

load_dotenv()

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
    "dart_OperatingIncomeLoss": "operating_profit",  # 수정
    "ifrs-full_ProfitLoss": "net_income",
    "ifrs-full_Assets": "total_assets",
    "ifrs-full_Equity": "total_equity",
    "ifrs-full_Liabilities": "total_debt",
    "ifrs-full_BasicEarningsLossPerShare": "eps",  # 수정
    # bps, dps는 DART에서 직접 제공 안 함 — 별도 처리 필요
}


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
        print(f"[ERROR] 요청 실패 {corp_code}: {e}")
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
):
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
    quarter_map = {"11011": 4, "11012": 2, "11013": 1, "11014": 3}
    report_type_map = {
        "11011": "annual",
        "11012": "quarter",
        "11013": "quarter",
        "11014": "quarter",
    }

    cursor.execute(
        sql,
        (
            ticker,
            corp_code,
            int(bsns_year),
            quarter_map.get(reprt_code, 4),
            report_type_map.get(reprt_code, "annual"),
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


def get_all_corps() -> list[tuple[str, str]]:
    cursor.execute(
        "SELECT ticker, corp_code FROM stocks WHERE corp_code IS NOT NULL AND is_active = 1"
    )
    return cursor.fetchall()


def run(bsns_year: str, reprt_code: str):
    corps = get_all_corps()
    total = len(corps)
    print(
        f"총 {total}개 종목 재무제표 적재 시작 ({bsns_year}, reprt_code={reprt_code})"
    )

    success, skip, error = 0, 0, 0

    for i, (ticker, corp_code) in enumerate(corps, 1):
        data = fetch_financial(corp_code, bsns_year, reprt_code)

        if data:
            insert_financial(ticker, corp_code, bsns_year, reprt_code, data)
            success += 1
        else:
            skip += 1

        if i % 100 == 0:
            print(f"  진행: {i}/{total} (성공={success}, 스킵={skip}, 오류={error})")

        time.sleep(0.3)

    print(f"\n완료: 성공={success}, 스킵={skip}, 오류={error}")


if __name__ == "__main__":
    run(bsns_year="2024", reprt_code="11011")
