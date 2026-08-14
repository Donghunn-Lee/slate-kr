"""
KIS 해외지수 일봉 → index_daily_prices idempotent upsert.

모드
  (인자 없음)              최신 100봉 창(=1콜)으로 저장된 최신일 이후만 append.
                           비어있는 지수는 자동으로 3년 백필로 승격(첫 실행).
  --backfill [--years N]   전 코드에 대해 N년(기본 3) 과거까지 walk 백필.
                           * KIS 하한까지 대량 백필은 backfill_overseas_index_prices.py 사용.

대상 지수 (8종 · DOMAIN_TO_ISCD 기준)
  SPX      S&P 500
  .DJI     다우존스
  COMP     나스닥종합
  NDX      나스닥 100
  NI225    닛케이 225        (KIS iscd = JP#NI225)
  HSI      항셍               (KIS iscd = HK#HS)
  SHCOMP   상해종합           (KIS iscd = SHANG)
  DAX      DAX                (KIS iscd = GR#DAX)

도메인 index_code 는 정규화 표기 (indices.ts 정합). KIS 심볼(#, alnum) 은
DOMAIN_TO_ISCD 로 격리 — DB / 웹은 도메인 코드, KIS 호출부만 iscd 사용.

호출
  GET /uapi/overseas-price/v1/quotations/inquire-daily-chartprice  tr_id=FHKST03030100
  FID_COND_MRKT_DIV_CODE='N' · FID_PERIOD_DIV_CODE='D'
  1콜 = FID_INPUT_DATE_2 직전 100봉만 반환(하드캡). tr_cont 미동작 →
  DATE_2 를 과거로 밀며 100봉 창을 walk 하는 방식으로 백필.

output2 매핑
  stck_bsop_date · ovrs_nmix_oprc/hgpr/lwpr/prpr · acml_vol
  (close 는 ovrs_nmix_prpr, 미존재 시 ovrs_nmix_clpr 폴백)

change / change_rate 는 연속 종가 diff 로 계산. daily 모드에서 첫 신규봉의
prior_close 는 DB 최신 종가를 이어붙여 chain 을 잇는다.

규약은 fetch_index_prices.py 와 정합: psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / per-code 에러 격리.
"""

import argparse
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

import requests
from dotenv import load_dotenv

from db import get_connection
from kis_token import get_token

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
API_URL = "/uapi/overseas-price/v1/quotations/inquire-daily-chartprice"
TR_ID = "FHKST03030100"
CALL_GAP_SEC = 0.5
DEFAULT_BACKFILL_YEARS = 3
# 100봉 하드캡 대비 안전 창 — 트레이딩일 100개 ≈ 140 캘린더일. 여유를 둬 200.
DAILY_WINDOW_DAYS = 200

# 도메인 index_code → KIS iscd. 기존 4종은 identity, 신규 4종은 KIS 심볼 매핑.
# backfill_overseas_index_prices.py 의 DOMAIN_TO_ISCD 와 정합.
DOMAIN_TO_ISCD: dict[str, str] = {
    "SPX":    "SPX",
    ".DJI":   ".DJI",
    "COMP":   "COMP",
    "NDX":    "NDX",
    "NI225":  "JP#NI225",
    "HSI":    "HK#HS",
    "SHCOMP": "SHANG",
    "DAX":    "GR#DAX",
}
OVERSEAS_CODES = tuple(DOMAIN_TO_ISCD.keys())

# ── 로깅 (fetch_index_prices.py 와 동일 형태) ─────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"overseas_indices_{datetime.today().strftime('%Y%m%d')}.log"
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


def kis_daily_call(token: str, iscd: str, d1: str, d2: str):
    """FHKST03030100 단일 호출. output2 list 반환 (실패 → None)."""
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
    rt_cd = body.get("rt_cd")
    if rt_cd != "0":
        logger.error(
            "KIS rt_cd=%s %s [%s~%s]: %s",
            rt_cd,
            iscd,
            d1,
            d2,
            str(body.get("msg1", ""))[:100],
        )
        return None
    o2 = body.get("output2") or []
    if not isinstance(o2, list):
        logger.error("KIS output2 형식 오류 %s [%s~%s]", iscd, d1, d2)
        return None
    return o2


def parse_bar(raw: dict):
    """output2 행 → (date_iso, open, high, low, close, volume). 실패 시 None."""
    try:
        d = raw.get("stck_bsop_date")
        if not d or len(d) != 8:
            return None
        date_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
        close_raw = raw.get("ovrs_nmix_prpr") or raw.get("ovrs_nmix_clpr")
        if close_raw in (None, ""):
            return None
        # 휴장 자리 채움 방어 — close 0 은 무효로 취급.
        close = Decimal(str(close_raw))
        if close == 0:
            return None
        open_ = Decimal(str(raw.get("ovrs_nmix_oprc") or close_raw))
        high = Decimal(str(raw.get("ovrs_nmix_hgpr") or close_raw))
        low = Decimal(str(raw.get("ovrs_nmix_lwpr") or close_raw))
        vol_raw = raw.get("acml_vol") or "0"
        volume = int(Decimal(str(vol_raw)))
        return (date_iso, open_, high, low, close, volume)
    except (InvalidOperation, ValueError, TypeError) as e:
        logger.warning("bar parse 실패: %s — raw=%s", e, raw)
        return None


def fetch_range(token: str, iscd: str, start: date, end: date):
    """[start, end] 범위에 해당하는 bars 를 100봉 창 walk 로 수집.
    반환: date_iso → (open, high, low, close, volume) dict (dedup).
    end 포함, start 미만은 조기 종료."""
    acc: dict[str, tuple] = {}
    cursor_end = end
    while cursor_end >= start:
        d2 = cursor_end.strftime("%Y%m%d")
        d1 = (cursor_end - timedelta(days=DAILY_WINDOW_DAYS)).strftime("%Y%m%d")
        bars = kis_daily_call(token, iscd, d1, d2)
        if bars is None:
            logger.warning("%s 창 실패 [%s~%s] — 다음 창으로", iscd, d1, d2)
            # 실패한 창은 스킵하되 무한루프 방지 위해 커서를 창 폭만큼 이동.
            cursor_end = cursor_end - timedelta(days=DAILY_WINDOW_DAYS)
            continue
        if not bars:
            logger.info("%s 창 빈응답 [%s~%s] — 데이터 하한 도달로 간주 종료", iscd, d1, d2)
            break

        oldest_in_window = None
        new_count = 0
        for raw in bars:
            parsed = parse_bar(raw)
            if parsed is None:
                continue
            di, o, h, low, c, v = parsed
            if di in acc:
                continue
            acc[di] = (o, h, low, c, v)
            new_count += 1
            if oldest_in_window is None or di < oldest_in_window:
                oldest_in_window = di

        if oldest_in_window is None:
            logger.info("%s 창 유효봉 0 [%s~%s] — 종료", iscd, d1, d2)
            break

        oldest_dt = datetime.strptime(oldest_in_window, "%Y-%m-%d").date()
        logger.info(
            "%s 창 [%s~%s] 신규 %d봉, oldest=%s",
            iscd, d1, d2, new_count, oldest_in_window,
        )
        if oldest_dt <= start:
            break
        # 다음 창은 이번 창의 oldest 를 그대로 종점으로 → 1일 overlap → dedup 로 처리.
        next_end = oldest_dt
        if next_end >= cursor_end:
            # 진행 없음(하한 도달 등) — 무한루프 방지.
            break
        cursor_end = next_end
    return acc


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
    """(latest_date, latest_close) or (None, None)."""
    cursor.execute(
        "SELECT base_date, close FROM index_daily_prices "
        "WHERE index_code = %s ORDER BY base_date DESC LIMIT 1",
        (index_code,),
    )
    row = cursor.fetchone()
    if row is None:
        return None, None
    return row[0], row[1]


def upsert_bars(conn, cursor, index_code: str, bars_by_date: dict, prior_close):
    """ASC 정렬 후 change chain 계산 → executemany 로 upsert.
    prior_close: chain 시작 이전의 close (없으면 None → 첫 봉 change=0).
    반환: (inserted_count, errored_count)."""
    if not bars_by_date:
        return 0, 0
    ordered = sorted(bars_by_date.items())  # (date_iso, tuple)
    tuples: list[tuple] = []
    prev_close = prior_close
    for date_iso, (o, h, low, c, v) in ordered:
        if prev_close is not None and prev_close != 0:
            change = c - Decimal(str(prev_close))
            try:
                change_rate = (change / Decimal(str(prev_close))) * Decimal("100")
            except InvalidOperation:
                change_rate = Decimal("0")
        else:
            change = Decimal("0")
            change_rate = Decimal("0")
        tuples.append(
            (
                index_code,
                date_iso,
                o, h, low, c,
                change, change_rate,
                v,
                0,  # value: KIS overseas 는 미제공 → 0
            )
        )
        prev_close = c

    try:
        cursor.executemany(UPSERT_SQL, tuples)
        conn.commit()
    except Exception as e:
        logger.error("%s upsert 실패: %s", index_code, e)
        conn.rollback()
        return 0, len(tuples)
    return len(tuples), 0


def run_backfill(years: int):
    end = datetime.today().date()
    start = end - timedelta(days=int(years * 365.25))
    logger.info("백필 시작 %s ~ %s (%d년) · 코드=%s", start, end, years, OVERSEAS_CODES)

    conn = get_connection()
    token = get_token(conn)
    cursor = conn.cursor()
    total_ins = total_err = 0
    try:
        for code in OVERSEAS_CODES:
            iscd = DOMAIN_TO_ISCD[code]
            try:
                bars = fetch_range(token, iscd, start, end)
                # 전체 백필은 chain 시작 이전 close 가 없으므로 None → 첫 봉 change=0.
                ins, err = upsert_bars(conn, cursor, code, bars, prior_close=None)
                logger.info("[%s] 백필 완료: 적재=%d 오류=%d", code, ins, err)
                total_ins += ins
                total_err += err
            except Exception as e:
                logger.error("[%s] 백필 예외, 다음 코드로 진행: %s", code, e)
                try:
                    conn.rollback()
                except Exception:
                    pass
                total_err += 1
    finally:
        cursor.close()
        conn.close()
    logger.info("백필 종료: 적재=%d 오류=%d", total_ins, total_err)


def run_daily():
    end = datetime.today().date()
    logger.info("일일 append 시작 · 대상=%s", OVERSEAS_CODES)

    conn = get_connection()
    token = get_token(conn)
    cursor = conn.cursor()
    total_ins = total_skp = total_err = 0
    try:
        for code in OVERSEAS_CODES:
            iscd = DOMAIN_TO_ISCD[code]
            try:
                latest_date, latest_close = get_latest_stored(cursor, code)
                if latest_date is None:
                    logger.info(
                        "[%s] 저장 데이터 없음 → 첫 실행: 백필로 승격 (%d년)",
                        code, DEFAULT_BACKFILL_YEARS,
                    )
                    start = end - timedelta(days=int(DEFAULT_BACKFILL_YEARS * 365.25))
                    bars = fetch_range(token, iscd, start, end)
                    ins, err = upsert_bars(conn, cursor, code, bars, prior_close=None)
                else:
                    # 최신일 다음 날부터. 100봉 창 하나면 대부분 커버.
                    bars = fetch_range(token, iscd, latest_date, end)
                    # latest_date 이하는 제거 (중복 방지) — chain 은 latest_close 로 이음.
                    filtered = {
                        d: v for d, v in bars.items()
                        if datetime.strptime(d, "%Y-%m-%d").date() > latest_date
                    }
                    if not filtered:
                        logger.info("[%s] 신규 봉 없음 (최신=%s)", code, latest_date)
                        total_skp += 1
                        continue
                    ins, err = upsert_bars(
                        conn, cursor, code, filtered, prior_close=latest_close,
                    )
                logger.info("[%s] 완료: 적재=%d 오류=%d", code, ins, err)
                total_ins += ins
                total_err += err
            except Exception as e:
                logger.error("[%s] 일일 처리 예외, 다음 코드로 진행: %s", code, e)
                try:
                    conn.rollback()
                except Exception:
                    pass
                total_err += 1
    finally:
        cursor.close()
        conn.close()
    logger.info("일일 종료: 적재=%d 스킵=%d 오류=%d", total_ins, total_skp, total_err)


def main():
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="KIS 해외지수 일봉 → index_daily_prices upsert"
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="전 코드 N년(기본 3) 과거까지 walk 백필. 미지정 시 daily append.",
    )
    parser.add_argument(
        "--years",
        type=int,
        default=DEFAULT_BACKFILL_YEARS,
        help=f"백필 기간(년). 기본 {DEFAULT_BACKFILL_YEARS}.",
    )
    args = parser.parse_args()

    if args.backfill:
        run_backfill(args.years)
    else:
        run_daily()


if __name__ == "__main__":
    main()
