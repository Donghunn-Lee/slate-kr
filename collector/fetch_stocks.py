import logging
import os
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

from db import get_connection

load_dotenv()

# ── 로깅 설정 ──────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"stocks_{datetime.today().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

FSS_API_KEY = os.getenv("FSS_API_KEY")

# 이탈 종목 비활성화 가드 (#120 F60)
#   MIN_COLLECTED: FSS 응답이 이 수 미만이면 부분 실패로 간주해 동기화 skip.
#     실측 활성 종목 ~2,681 중 명백한 이탈은 여유를 두고 2,000 을 하한으로 잡는다.
#   MAX_DEACTIVATE: 한 회에 비활성 처리 상한. 초과 시 대량 오탐 우려로 skip + WARN.
#     override 레버 없음 — 초과 시 원인 파악부터 하도록 강제.
MIN_COLLECTED = 2000
MAX_DEACTIVATE = 30


def fetch_stock_list() -> list[dict]:
    biz_date = get_latest_biz_date()
    logger.info("기준일자: %s", biz_date)

    url = "https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo"
    result = []
    page = 1
    num_of_rows = 1000

    while True:
        res = requests.get(
            url,
            params={
                "serviceKey": FSS_API_KEY,
                "resultType": "json",
                "numOfRows": num_of_rows,
                "pageNo": page,
                "basDt": biz_date,
            },
            timeout=(5, 30),
        )
        res.raise_for_status()
        data = res.json()

        body = data["response"]["body"]
        items = body["items"]["item"]
        total = body["totalCount"]

        for item in items:
            market = item.get("mrktCtg", "")
            if market not in ("KOSPI", "KOSDAQ"):
                continue

            ticker = item.get("srtnCd", "").lstrip("A")
            name = item.get("itmsNm", "").strip()

            if not ticker or not name:
                continue

            result.append(
                {
                    "ticker": ticker,
                    "name": name,
                    "market": market,
                }
            )

        if page * num_of_rows >= total:
            break
        page += 1

    return result


def upsert_stocks(conn, stocks: list[dict]):
    cursor = conn.cursor()
    # 재상장 복구: 과거 비활성 처리된 티커가 FSS 목록에 다시 나타나면 is_active=true 로 되돌린다.
    sql = """
        INSERT INTO stocks (ticker, name, market)
        VALUES (%s, %s, %s)
        ON CONFLICT (ticker) DO UPDATE SET
            name = EXCLUDED.name,
            market = EXCLUDED.market,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
    """
    rows = [(s["ticker"], s["name"], s["market"]) for s in stocks]
    try:
        cursor.executemany(sql, rows)
        conn.commit()
        logger.info("%d개 종목 upsert 완료", len(rows))
    except Exception as e:
        logger.error("DB upsert 실패: %s", e)
        conn.rollback()
    finally:
        cursor.close()


def deactivate_missing(conn, collected: list[dict]) -> None:
    """FSS 목록에서 이탈한 종목을 is_active=false 로 동기화 (#120 F60).

    가드
      · collected < MIN_COLLECTED : FSS 부분 실패 정황 → skip
      · missing  > MAX_DEACTIVATE : 대량 오탐 우려 → skip (수동 확인 필요)

    가드 미통과 시 upsert 단계는 이미 완료된 상태 그대로 두고 이 단계만 건너뛴다.
    """
    if len(collected) < MIN_COLLECTED:
        logger.warning(
            "동기화 skip: 수집 종목 수(%d) < 하한(%d) — FSS 부분 실패 정황",
            len(collected), MIN_COLLECTED,
        )
        return

    collected_tks = [s["ticker"] for s in collected]
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT ticker, name FROM stocks WHERE is_active = true AND NOT (ticker = ANY(%s))",
            (collected_tks,),
        )
        missing = cursor.fetchall()  # [(ticker, name), ...]

        if not missing:
            logger.info("동기화 완료: 이탈 종목 없음")
            return

        if len(missing) > MAX_DEACTIVATE:
            detail = ", ".join(f"{t}({n})" for t, n in missing)
            array_literal = "ARRAY[" + ",".join(f"'{t}'" for t, _ in missing) + "]"
            logger.warning(
                "동기화 skip: 이탈 후보(%d) > 상한(%d). 수동 확인 필요. 전체: %s",
                len(missing), MAX_DEACTIVATE, detail,
            )
            logger.warning("수동 UPDATE용 티커 배열: %s", array_literal)
            return

        missing_tks = [t for t, _ in missing]
        cursor.execute(
            "UPDATE stocks SET is_active = false, updated_at = CURRENT_TIMESTAMP "
            "WHERE ticker = ANY(%s)",
            (missing_tks,),
        )
        conn.commit()
        detail = ", ".join(f"{t}({n})" for t, n in missing)
        logger.info("%d개 종목 비활성화: %s", len(missing), detail)
    except Exception as e:
        logger.error("동기화 실패: %s", e)
        conn.rollback()
    finally:
        cursor.close()


def get_latest_biz_date() -> str:
    """오늘이 월요일이면 금요일, 아니면 어제"""
    today = datetime.now()
    if today.weekday() == 0:  # 월요일
        target = today - timedelta(days=3)
    else:
        target = today - timedelta(days=1)
    return target.strftime("%Y%m%d")


def main():
    logger.info("KRX 상장종목 조회 중...")
    try:
        stocks = fetch_stock_list()
    except Exception as e:
        logger.error("종목 목록 조회 실패: %s", e)
        return

    logger.info("KOSPI/KOSDAQ 종목 수: %d", len(stocks))

    conn = get_connection()
    try:
        upsert_stocks(conn, stocks)
        deactivate_missing(conn, stocks)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
