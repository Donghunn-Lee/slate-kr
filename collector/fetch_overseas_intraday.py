"""
KIS 해외지수 1분봉 → overseas_index_intraday idempotent upsert.

30분 주기 GitHub Actions cron 으로 실행되며, kis_token 테이블의 access_token
을 read-only 로 사용한다(토큰 발급 책임은 issue_kis_token.py 의 12h cron).
토큰이 만료된 상태면 이번 실행은 로그 남기고 exit 0 — 다음 cron 이 재시도.

대상 지수 (US 3종)
  SPX      S&P 500
  COMP     NASDAQ Composite
  NDX      NASDAQ 100
  (.DJI 는 intraday API 가 rt_cd=0 + 빈 배열을 돌려주므로 대상에서 제외)

호출
  GET /uapi/overseas-price/v1/quotations/inquire-time-indexchartprice
  tr_id=FHKST03030200 · FID_HOUR_CLS_CODE=0 · FID_PW_DATA_INCU_YN=Y
  FID_INPUT_HOUR_1 은 무시되는 파라미터이므로 전달하지 않음 (probe 확정).

output2 매핑
  stck_bsop_date(YYYYMMDD) + stck_cntg_hour(HHMMSS) → ts (ET 로컬 naive)
  optn_oprc / optn_hgpr / optn_lwpr / optn_prpr → open/high/low/close
  cntg_vol 은 지수 분봉에서 항상 0 이므로 저장하지 않음.

retention
  적재 후 (오늘 ET - 7 일) 이전 봉 삭제. ET 는 UTC-5h(EST) 근사로 계산.
  경계 정밀도는 불필요 — DST 편차는 하루치 봉이 스치는 정도라 무해.

규약은 fetch_overseas_indices.py 와 정합: psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / per-code 에러 격리.
"""

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import psycopg2
import requests
from dotenv import load_dotenv

from kis_token import get_token

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
API_URL = "/uapi/overseas-price/v1/quotations/inquire-time-indexchartprice"
TR_ID = "FHKST03030200"
CALL_GAP_SEC = 0.5
RETENTION_DAYS = 7
# ET 근사 오프셋(EST=UTC-5). retention 경계는 정밀할 필요 없음.
ET_OFFSET_HOURS = 5

OVERSEAS_CODES = ("SPX", "COMP", "NDX")

# 마커행 방어 — 국내 필터와 동일하게 999999/888888 시각은 skip.
MARKER_HOURS = {"999999", "888888"}

# ── 로깅 ────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"overseas_intraday_{datetime.today().strftime('%Y%m%d')}.log"
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


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def kis_intraday_call(token: str, iscd: str):
    """FHKST03030200 단일 호출. output2 list 반환 (실패 → None)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": KIS_APP_KEY,
        "appsecret": KIS_APP_SECRET,
        "tr_id": TR_ID,
        "custtype": "P",
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "N",
        "FID_INPUT_ISCD": iscd,
        "FID_HOUR_CLS_CODE": "0",
        "FID_PW_DATA_INCU_YN": "Y",
    }
    try:
        r = requests.get(
            f"{DOMAIN}{API_URL}", headers=headers, params=params, timeout=15
        )
    except requests.RequestException as e:
        logger.error("KIS 호출 실패 %s: %s", iscd, e)
        return None
    finally:
        time.sleep(CALL_GAP_SEC)
    if r.status_code != 200:
        logger.error("KIS HTTP %d %s: %s", r.status_code, iscd, r.text[:200])
        return None
    try:
        body = r.json()
    except ValueError:
        logger.error("KIS JSON 파싱 실패 %s", iscd)
        return None
    rt_cd = body.get("rt_cd")
    if rt_cd != "0":
        logger.error(
            "KIS rt_cd=%s %s: %s", rt_cd, iscd, str(body.get("msg1", ""))[:100]
        )
        return None
    o2 = body.get("output2") or []
    if not isinstance(o2, list):
        logger.error("KIS output2 형식 오류 %s", iscd)
        return None
    return o2


def parse_bar(raw: dict):
    """output2 행 → (ts_naive, open, high, low, close). 무효 시 None."""
    d = raw.get("stck_bsop_date")
    t = raw.get("stck_cntg_hour")
    if not d or not t or len(d) != 8 or len(t) != 6:
        return None
    if t in MARKER_HOURS:
        return None
    try:
        ts = datetime.strptime(f"{d}{t}", "%Y%m%d%H%M%S")
    except ValueError:
        return None
    try:
        open_ = Decimal(str(raw.get("optn_oprc")))
        high = Decimal(str(raw.get("optn_hgpr")))
        low = Decimal(str(raw.get("optn_lwpr")))
        close = Decimal(str(raw.get("optn_prpr")))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if open_ == 0 and high == 0 and low == 0 and close == 0:
        return None
    return (ts, open_, high, low, close)


UPSERT_SQL = """
    INSERT INTO overseas_index_intraday
      (index_code, ts, open, high, low, close, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, now())
    ON CONFLICT (index_code, ts) DO UPDATE SET
      open       = EXCLUDED.open,
      high       = EXCLUDED.high,
      low        = EXCLUDED.low,
      close      = EXCLUDED.close,
      updated_at = now()
"""


def upsert_bars(conn, cursor, index_code: str, bars: list) -> int:
    """bars: [(ts, o, h, l, c), ...]. 반환: upsert 행 수."""
    if not bars:
        return 0
    tuples = [
        (index_code, ts, o, h, low, c) for (ts, o, h, low, c) in bars
    ]
    try:
        cursor.executemany(UPSERT_SQL, tuples)
        conn.commit()
    except Exception as e:
        logger.error("%s upsert 실패: %s", index_code, e)
        conn.rollback()
        raise
    return len(tuples)


def prune_old(conn, cursor) -> int:
    """(오늘 ET - RETENTION_DAYS) 이전 봉 삭제. 반환: 삭제 행 수."""
    cutoff_date = (
        datetime.now(timezone.utc)
        - timedelta(hours=ET_OFFSET_HOURS, days=RETENTION_DAYS)
    ).date()
    try:
        cursor.execute(
            "DELETE FROM overseas_index_intraday WHERE ts < %s", (cutoff_date,)
        )
        deleted = cursor.rowcount
        conn.commit()
    except Exception as e:
        logger.error("retention 삭제 실패 (cutoff=%s): %s", cutoff_date, e)
        conn.rollback()
        return 0
    logger.info("retention: ts < %s 삭제=%d", cutoff_date, deleted)
    return deleted


def run():
    logger.info("해외지수 intraday 시작 · 대상=%s", OVERSEAS_CODES)

    conn = get_connection()
    cursor = conn.cursor()
    try:
        token = get_token(conn)

        total_recv = total_ins = total_skip = 0
        for code in OVERSEAS_CODES:
            try:
                raw_bars = kis_intraday_call(token, code)
                if raw_bars is None:
                    logger.warning("[%s] 호출 실패 — 다음 코드로", code)
                    continue
                recv = len(raw_bars)
                valid = []
                skipped = 0
                for raw in raw_bars:
                    parsed = parse_bar(raw)
                    if parsed is None:
                        skipped += 1
                        continue
                    valid.append(parsed)
                if skipped:
                    logger.warning("[%s] 무효봉 skip=%d (수신=%d)", code, skipped, recv)
                ins = upsert_bars(conn, cursor, code, valid)
                logger.info("[%s] 수신=%d upsert=%d skip=%d", code, recv, ins, skipped)
                total_recv += recv
                total_ins += ins
                total_skip += skipped
            except Exception as e:
                logger.error("[%s] 처리 예외, 다음 코드로 진행: %s", code, e)
                try:
                    conn.rollback()
                except Exception:
                    pass

        prune_old(conn, cursor)
        logger.info(
            "종료: 수신합계=%d upsert합계=%d skip합계=%d",
            total_recv,
            total_ins,
            total_skip,
        )
    finally:
        cursor.close()
        conn.close()


def main():
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정")
        sys.exit(1)
    run()


if __name__ == "__main__":
    main()
