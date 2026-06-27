"""
KRX Marketplace 지수 일봉 → index_daily_prices idempotent upsert.

모드
  (인자 없음)              직전일(today − 1, KST) 1일 적재
                           (KRX Marketplace 가 당일 데이터를 익일 08:00 갱신하므로
                            익일 오전 cron 에서 "어제"를 조회)
                           휴장·주말 직전일은 KRX 빈 응답으로 skip
  --backfill START END     YYYY-MM-DD 구간 순회 적재
                           주말은 사전 스킵, 공휴일은 KRX 빈 응답으로 skip

대상 지수 (3종)
  KOSPI / KOSDAQ / KOSPI200

호출 (영업일당 2회)
  idx/kospi_dd_trd   → IDX_NM '코스피' + '코스피 200' 두 건 추출
  idx/kosdaq_dd_trd  → IDX_NM '코스닥' 한 건 추출

규약은 fetch_prices.py 와 정합: psycopg2 / load_dotenv / logs/{prefix}_{YYYYMMDD}.log /
ON CONFLICT DO UPDATE / 에러 격리.
"""

import argparse
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv()

KRX_KEY = os.getenv("KRX_OPEN_API_KEY")
KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis"

# ── 로깅 (fetch_prices.py 와 동일 형태) ───────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"index_prices_{datetime.today().strftime('%Y%m%d')}.log"
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


# IDX_NM (KRX 원본 그대로, 공백 포함) → index_code 매핑
IDX_NM_TO_CODE = {
    "코스피": "KOSPI",
    "코스피 200": "KOSPI200",
    "코스닥": "KOSDAQ",
}

# endpoint → 그 endpoint 응답에서 추출할 IDX_NM 들
ENDPOINT_TO_NAMES: dict[str, tuple[str, ...]] = {
    "idx/kospi_dd_trd": ("코스피", "코스피 200"),
    "idx/kosdaq_dd_trd": ("코스닥",),
}

BACKFILL_SLEEP_SEC = 0.3


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def krx_call(path: str, bas_dd: str):
    """
    KRX Marketplace 단일 일자 호출.
    성공 → rows (list, 빈 배열 가능 = 휴장)
    실패 → None
    """
    try:
        r = requests.get(
            f"{KRX_BASE}/{path}",
            headers={"AUTH_KEY": (KRX_KEY or "").strip()},
            params={"basDd": bas_dd},
            timeout=30,
        )
    except requests.RequestException as e:
        logger.error("KRX 호출 실패 %s %s: %s", path, bas_dd, e)
        return None
    if r.status_code != 200:
        logger.error(
            "KRX HTTP %s %s %s: %s", r.status_code, path, bas_dd, r.text[:200]
        )
        return None
    try:
        data = r.json()
    except ValueError:
        logger.error("KRX JSON 파싱 실패 %s %s", path, bas_dd)
        return None
    return data.get("OutBlock_1") or []


def parse_row(row: dict, index_code: str):
    """KRX 행 → upsert 바인드 튜플. 키/숫자 변환 실패 시 None."""
    try:
        bas_dd = row["BAS_DD"]
        return (
            index_code,
            f"{bas_dd[0:4]}-{bas_dd[4:6]}-{bas_dd[6:8]}",
            Decimal(row["OPNPRC_IDX"]),
            Decimal(row["HGPRC_IDX"]),
            Decimal(row["LWPRC_IDX"]),
            Decimal(row["CLSPRC_IDX"]),
            Decimal(row["CMPPREVDD_IDX"]),
            Decimal(row["FLUC_RT"]),
            int(row["ACC_TRDVOL"]),
            int(row["ACC_TRDVAL"]),
        )
    except (KeyError, ValueError, TypeError, InvalidOperation) as e:
        logger.error("행 변환 실패 (%s): %s — row=%s", index_code, e, row)
        return None


UPSERT_SQL = """
    INSERT INTO index_daily_prices
      (index_code, base_date, open, high, low, close, change, change_rate, volume, value)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (index_code, base_date) DO UPDATE SET
      open        = EXCLUDED.open,
      high        = EXCLUDED.high,
      low         = EXCLUDED.low,
      close       = EXCLUDED.close,
      change      = EXCLUDED.change,
      change_rate = EXCLUDED.change_rate,
      volume      = EXCLUDED.volume,
      value       = EXCLUDED.value
"""


def fetch_day(conn, cursor, bas_dd: str):
    """
    한 날짜 적재. 2 endpoint 호출 → 최대 3개 지수 upsert.
    반환 (inserted, skipped, errored) — 모두 지수 단위 카운트.
    """
    rows_to_upsert: list[tuple] = []
    skipped = 0
    errored = 0

    for path, target_names in ENDPOINT_TO_NAMES.items():
        rows = krx_call(path, bas_dd)
        if rows is None:
            errored += len(target_names)
            continue
        if not rows:
            logger.info("빈 응답 %s %s → 휴장으로 간주, skip", path, bas_dd)
            skipped += len(target_names)
            continue

        by_name = {r.get("IDX_NM"): r for r in rows}
        for nm in target_names:
            src = by_name.get(nm)
            if src is None:
                logger.warning("IDX_NM '%s' 미존재 (%s %s)", nm, path, bas_dd)
                errored += 1
                continue
            tup = parse_row(src, IDX_NM_TO_CODE[nm])
            if tup is None:
                errored += 1
                continue
            rows_to_upsert.append(tup)

    if not rows_to_upsert:
        return 0, skipped, errored

    try:
        cursor.executemany(UPSERT_SQL, rows_to_upsert)
        conn.commit()
    except Exception as e:
        logger.error("DB upsert 실패 %s: %s", bas_dd, e)
        conn.rollback()
        return 0, skipped, errored + len(rows_to_upsert)

    return len(rows_to_upsert), skipped, errored


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def run_daily():
    # KRX Marketplace 는 당일 데이터를 익일 08:00 갱신하므로
    # 익일 오전 cron 은 "어제"를 조회한다. 주말·휴장 직전일은
    # KRX 빈 응답으로 graceful skip 되므로 별도 영업일 판정은 두지 않는다.
    target = datetime.today() - timedelta(days=1)
    bas_dd = target.strftime("%Y%m%d")
    logger.info("일일 적재 시작 %s (직전일)", bas_dd)

    conn = get_connection()
    cursor = conn.cursor()
    try:
        ins, skp, err = fetch_day(conn, cursor, bas_dd)
    finally:
        cursor.close()
        conn.close()

    logger.info("완료 %s: 적재=%d, 스킵=%d, 오류=%d", bas_dd, ins, skp, err)


def run_backfill(start_str: str, end_str: str):
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d").date()
        end = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError as e:
        logger.error("--backfill 인자 형식 오류 (YYYY-MM-DD): %s", e)
        sys.exit(2)
    if start > end:
        logger.error("--backfill START(%s) > END(%s) — 범위 오류", start_str, end_str)
        sys.exit(2)

    weekdays = [d for d in daterange(start, end) if d.weekday() < 5]
    logger.info(
        "백필 시작 %s ~ %s — 영업일 후보 %d일 "
        "(주말 사전 스킵, 공휴일은 빈 응답으로 skip)",
        start_str,
        end_str,
        len(weekdays),
    )

    conn = get_connection()
    cursor = conn.cursor()
    total_ins = total_skp = total_err = 0
    try:
        for i, d in enumerate(weekdays, 1):
            bas_dd = d.strftime("%Y%m%d")
            try:
                ins, skp, err = fetch_day(conn, cursor, bas_dd)
            except Exception as e:
                logger.error("날짜 처리 예외, 다음 날짜로 진행 %s: %s", bas_dd, e)
                try:
                    conn.rollback()
                except Exception:
                    pass
                ins, skp, err = 0, 0, 3  # 3개 지수 전부 실패로 집계

            total_ins += ins
            total_skp += skp
            total_err += err

            if i % 20 == 0 or i == len(weekdays):
                logger.info(
                    "진행 %d/%d (%s): 누적 적재=%d, 스킵=%d, 오류=%d",
                    i,
                    len(weekdays),
                    bas_dd,
                    total_ins,
                    total_skp,
                    total_err,
                )
            time.sleep(BACKFILL_SLEEP_SEC)
    finally:
        cursor.close()
        conn.close()

    logger.info(
        "백필 완료: 적재=%d, 스킵=%d, 오류=%d (영업일 후보 %d일)",
        total_ins,
        total_skp,
        total_err,
        len(weekdays),
    )


def main():
    if not KRX_KEY:
        logger.error("KRX_OPEN_API_KEY 미설정 (collector/.env)")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="KRX 지수 일봉 → index_daily_prices upsert"
    )
    parser.add_argument(
        "--backfill",
        nargs=2,
        metavar=("START", "END"),
        help="백필 구간 (YYYY-MM-DD YYYY-MM-DD). 미지정 시 당일 적재.",
    )
    args = parser.parse_args()

    if args.backfill:
        run_backfill(args.backfill[0], args.backfill[1])
    else:
        run_daily()


if __name__ == "__main__":
    main()
