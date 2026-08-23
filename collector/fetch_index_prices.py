"""
KIS 국내지수 일봉 → index_daily_prices idempotent upsert (당일 EOD 회귀 적재).

모드
  (인자 없음)  지수별 DB MAX(base_date)+1 ~ today(KST) 구간 append.
               신규 봉 없으면 no-op 로그. 빈 테이블은 에러 (백필 스크립트 필요).
               휴장·주말은 KIS 응답에 봉이 없으므로 자연 skip.

  * 대량 과거 백필은 backfill_index_prices.py (KRX Marketplace 전용) 사용.

대상 지수 (4종, IndexCode 상수와 정합)
  KOSPI     KOSDAQ     KOSPI200     KOSDAQ150

호출
  GET /uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice
  tr_id=FHKUP03500100 · FID_COND_MRKT_DIV_CODE='U' · FID_PERIOD_DIV_CODE='D'
  output2: DESC(최신→과거) 정렬 · 60일 요청 시 약 41 트레이딩봉 반환 (probe #097).

output2 매핑
  stck_bsop_date · bstp_nmix_oprc/hgpr/lwpr/prpr · acml_vol · acml_tr_pbmn
  등락/등락률은 output2 미포함 → prev_close chain 계산.

단위 환산 (probe #097 실측)
  acml_vol      × 1,000       → volume(주)
  acml_tr_pbmn  × 1,000,000   → value(원)
  KOSDAQ 는 KRX 대비 vol/val 이 ~1% 크게 나옴(원인 미상, OHLC 는 완전 일치).
  보정하지 않음 — 지수 표시엔 OHLC 가 우선.

규약 정합 (fetch_overseas_indices.py 대칭): psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / per-code 에러 격리.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import requests
from dotenv import load_dotenv

from db import get_connection
from kis_token import get_token
from verify_daily_freshness import compute_expected_from_now

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
API_URL = "/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice"
TR_ID = "FHKUP03500100"
CALL_GAP_SEC = 0.5
# 1콜 41 트레이딩봉 상한(probe #097). 60 캘린더일 = 약 40~43 봉 → 여유 두고 55.
DAILY_GAP_LIMIT_DAYS = 55
KST = timezone(timedelta(hours=9))

# IndexCode(웹) → KIS 국내업종 ISCD.
# daily TR 코드는 quote TR 과 상이 (KOSDAQ150: quote=3003 / daily=2203,
# #097 probe 실측). 웹 IndexCode 상수 재사용 금지 — 이 매핑은 KIS API
# 전용이므로 이 파일에 하드코딩한다.
INDEX_CODE_TO_ISCD: dict[str, str] = {
    "KOSPI":     "0001",
    "KOSDAQ":    "1001",
    "KOSPI200":  "2001",
    "KOSDAQ150": "2203",
}

# ── 로깅 (fetch_overseas_indices.py 와 동일 형태) ─────────────
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


def kis_daily_call(token: str, iscd: str, d1: str, d2: str) -> list | None:
    """FHKUP03500100 단일 호출. output2 list 반환 (실패 → None)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": KIS_APP_KEY,
        "appsecret": KIS_APP_SECRET,
        "tr_id": TR_ID,
        "custtype": "P",
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "U",
        "FID_INPUT_ISCD": iscd,
        "FID_INPUT_DATE_1": d1,
        "FID_INPUT_DATE_2": d2,
        "FID_PERIOD_DIV_CODE": "D",
    }
    try:
        r = requests.get(
            f"{DOMAIN}{API_URL}", headers=headers, params=params, timeout=15
        )
    except requests.RequestException as e:
        logger.error("KIS 호출 실패 %s [%s~%s]: %s", iscd, d1, d2, e)
        return None
    finally:
        time.sleep(CALL_GAP_SEC)
    if r.status_code != 200:
        logger.error(
            "KIS HTTP %d %s [%s~%s]: %s", r.status_code, iscd, d1, d2, r.text[:200]
        )
        return None
    try:
        body = r.json()
    except ValueError:
        logger.error("KIS JSON 파싱 실패 %s [%s~%s]", iscd, d1, d2)
        return None
    if body.get("rt_cd") != "0":
        logger.error(
            "KIS rt_cd=%s %s [%s~%s]: %s",
            body.get("rt_cd"), iscd, d1, d2,
            str(body.get("msg1", ""))[:100],
        )
        return None
    o2 = body.get("output2") or []
    if not isinstance(o2, list):
        logger.error("KIS output2 형식 오류 %s [%s~%s]", iscd, d1, d2)
        return None
    return o2


def parse_bar(raw: dict):
    """output2 행 → (date_iso, open, high, low, close, volume, value). 무효 시 None."""
    try:
        d = raw.get("stck_bsop_date")
        if not d or len(d) != 8:
            return None
        date_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
        close = Decimal(str(raw.get("bstp_nmix_prpr")))
        if close == 0:
            return None
        open_ = Decimal(str(raw.get("bstp_nmix_oprc")))
        high = Decimal(str(raw.get("bstp_nmix_hgpr")))
        low = Decimal(str(raw.get("bstp_nmix_lwpr")))
        # 단위 환산 — probe #097 실측: acml_vol=천주, acml_tr_pbmn=백만원.
        vol_k = int(Decimal(str(raw.get("acml_vol") or "0")))
        val_m = int(Decimal(str(raw.get("acml_tr_pbmn") or "0")))
        volume = vol_k * 1_000
        value = val_m * 1_000_000
        return (date_iso, open_, high, low, close, volume, value)
    except (InvalidOperation, ValueError, TypeError) as e:
        logger.warning("bar parse 실패: %s — raw=%s", e, raw)
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


def get_latest_stored(cursor, index_code: str):
    """(latest_date, latest_close) 반환. 없으면 (None, None)."""
    cursor.execute(
        "SELECT base_date, close FROM index_daily_prices "
        "WHERE index_code = %s ORDER BY base_date DESC LIMIT 1",
        (index_code,),
    )
    row = cursor.fetchone()
    if row is None:
        return None, None
    return row[0], row[1]


def upsert_bars(conn, cursor, index_code: str, bars_asc: list, prior_close) -> int:
    """bars_asc: [(date_iso, o, h, l, c, vol, val), ...] ASC.
    prior_close 로 change chain 계산 후 executemany upsert. 반환: upsert 행 수."""
    tuples: list[tuple] = []
    prev = prior_close
    for date_iso, o, h, l, c, vol, val in bars_asc:
        if prev is not None and prev != 0:
            change = c - Decimal(str(prev))
            try:
                change_rate = (change / Decimal(str(prev))) * Decimal("100")
            except InvalidOperation:
                change_rate = Decimal("0")
        else:
            change = Decimal("0")
            change_rate = Decimal("0")
        tuples.append(
            (index_code, date_iso, o, h, l, c, change, change_rate, vol, val)
        )
        prev = c
    try:
        cursor.executemany(UPSERT_SQL, tuples)
        conn.commit()
    except Exception as e:
        logger.error("%s upsert 실패: %s", index_code, e)
        conn.rollback()
        raise
    return len(tuples)


def run_one(conn, cursor, token: str, index_code: str, iscd: str, end: date):
    """지수 1건 처리. 반환: (inserted, skipped_no_new). 예외는 상위에서 격리."""
    latest_date, latest_close = get_latest_stored(cursor, index_code)
    if latest_date is None:
        # 빈 테이블은 백필 스크립트 소관 — 여기서 임의 승격하지 않는다.
        raise RuntimeError(
            f"[{index_code}] index_daily_prices 비어있음 — "
            f"backfill_index_prices.py --backfill START END 로 초기 적재 필요"
        )
    d1 = latest_date + timedelta(days=1)
    if d1 > end:
        logger.info("[%s] 이미 최신 (latest=%s ≥ end=%s) — no-op", index_code, latest_date, end)
        return 0, 1
    gap = (end - latest_date).days
    if gap > DAILY_GAP_LIMIT_DAYS:
        # 41봉 상한 초과 우려 — daily 경로에서 처리 금지.
        raise RuntimeError(
            f"[{index_code}] gap={gap}일 (latest={latest_date}, end={end}) "
            f"> {DAILY_GAP_LIMIT_DAYS}일 — 1콜 41봉 상한 초과 우려. "
            f"backfill_index_prices.py --backfill {latest_date} {end} 사용 필요"
        )

    d1_str = d1.strftime("%Y%m%d")
    d2_str = end.strftime("%Y%m%d")
    logger.info("[%s] fetch %s~%s (ISCD=%s)", index_code, d1_str, d2_str, iscd)
    bars = kis_daily_call(token, iscd, d1_str, d2_str)
    if bars is None:
        raise RuntimeError(f"[{index_code}] KIS 호출 실패")

    parsed: dict[str, tuple] = {}
    for raw in bars:
        p = parse_bar(raw)
        if p is None:
            continue
        d_iso = p[0]
        bar_date = datetime.strptime(d_iso, "%Y-%m-%d").date()
        # end 초과 필터 (KIS 가 장중 in-progress 봉을 반환할 수 있음).
        if bar_date > end:
            logger.warning("[%s] drop in-progress bar %s > end %s", index_code, d_iso, end)
            continue
        # latest_date 이하 필터 (KIS 가 경계 포함해 반환할 수 있음).
        if bar_date <= latest_date:
            continue
        parsed[d_iso] = p  # dedup

    if not parsed:
        logger.info("[%s] 신규 봉 없음 (latest=%s, 응답=%d봉)", index_code, latest_date, len(bars))
        return 0, 1

    ordered = [parsed[d] for d in sorted(parsed.keys())]  # ASC
    ins = upsert_bars(conn, cursor, index_code, ordered, prior_close=latest_close)
    logger.info(
        "[%s] append %d봉 (%s ~ %s), prior_close=%s",
        index_code, ins, ordered[0][0], ordered[-1][0], latest_close,
    )
    return ins, 0


def main():
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정")
        sys.exit(1)

    now_kst = datetime.now(KST)
    end = compute_expected_from_now(now_kst)
    logger.info(
        "일일 적재 시작 · now(KST)=%s · end 캡=%s · 대상=%s",
        now_kst.strftime("%Y-%m-%d %H:%M:%S"), end, list(INDEX_CODE_TO_ISCD),
    )

    conn = get_connection()
    cursor = conn.cursor()

    try:
        token = get_token(conn)

        total_ins = total_noop = total_err = 0
        for code, iscd in INDEX_CODE_TO_ISCD.items():
            try:
                ins, noop = run_one(conn, cursor, token, code, iscd, end)
                total_ins += ins
                total_noop += noop
            except Exception as e:
                logger.error("%s", e)
                total_err += 1
                try:
                    conn.rollback()
                except Exception:
                    pass

        logger.info(
            "완료: 적재=%d, no-op=%d, 오류=%d",
            total_ins, total_noop, total_err,
        )
        if total_err:
            sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
