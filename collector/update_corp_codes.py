import os
import io
import zipfile
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
import requests
import mysql.connector

load_dotenv()

db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cursor = db.cursor()


def fetch_corp_codes() -> dict[str, str]:
    """DART corpCode.xml에서 ticker → corp_code 매핑 반환"""
    url = "https://opendart.fss.or.kr/api/corpCode.xml"
    res = requests.get(url, params={"crtfc_key": os.getenv("DART_API_KEY")})
    res.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)

    mapping = {}
    for item in tree.getroot().findall("list"):
        ticker = item.findtext("stock_code", "").strip()
        corp_code = item.findtext("corp_code", "").strip()
        if ticker:
            mapping[ticker] = corp_code

    return mapping


def update_corp_codes(mapping: dict[str, str]):
    sql = "UPDATE stocks SET corp_code = %s WHERE ticker = %s"
    rows = [(corp_code, ticker) for ticker, corp_code in mapping.items()]
    cursor.executemany(sql, rows)
    db.commit()
    print(f"업데이트 완료: {cursor.rowcount}건")


if __name__ == "__main__":
    print("DART corpCode.xml 다운로드 중...")
    mapping = fetch_corp_codes()
    print(f"매핑 데이터: {len(mapping)}개")
    update_corp_codes(mapping)

    # 확인
    cursor.execute(
        "SELECT ticker, corp_code FROM stocks WHERE corp_code IS NOT NULL LIMIT 5"
    )
    for row in cursor.fetchall():
        print(row)

    cursor.close()
    db.close()
