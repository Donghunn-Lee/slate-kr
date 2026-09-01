"""
KIS 국내주식 일봉 → daily_prices idempotent upsert (당일 EOD 회귀 적재).

전환 배경 (#098)
  이전 소스 pykrx 는 D+1 08:00 KST 공표 특성상 당일 16:00 적재 불가. KIS
  FHKST03010100 은 장 마감 직후 확정 종가 반환. probe #098 실측: adj=0 옵션이
  기존 pykrx 수정주가와 close 완전 정합 (900 pair, 0 diff), OHL 실질 정합,
  volume 은 정의 차이(시간외 포함 추정)로 상이 — 과거 재적재 없이 경계일부터
  KIS 정의를 그대로 수용.

end 시각 캡 (핵심)
  end = compute_expected_from_now(now_kst) — 거래일 16:00 이상만 today, 그 외
  직전 거래일. 어느 시각에 실행돼도 확정치만 적재. --force 류 우회 레버 없음.
  방어 필터로 output2 의 end 초과 row (당일 라이브 스냅) 는 무조건 drop.

incremental
  종목별 MAX(date)+1 ~ end. start > end 면 skip (재실행 no-op).
  gap > 150 캘린더일 (≈ 100 트레이딩봉 상한) 초과 시 backfill_prices.py 안내 후
  해당 종목 skip. 대량 백필은 daily 경로 소관 아님.

호출
  GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice
  tr_id=FHKST03010100 · FID_COND_MRKT_DIV_CODE='J' (KOSPI/KOSDAQ 공용) ·
  FID_PERIOD_DIV_CODE='D' · FID_ORG_ADJ_PRC='0' (수정주가).
  output2 (DESC): stck_bsop_date · stck_oprc/hgpr/lwpr/clpr · acml_vol.

규약 정합 (fetch_index_prices.py 대칭): psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / 종목별 에러 격리 /
per-batch 커넥션 교체.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

from db import get_connection
from kis_token import get_token
from verify_daily_freshness import compute_expected_from_now, load_krx_calendar

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
API_URL = "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
TR_ID = "FHKST03010100"
CALL_GAP_SEC = 0.15
# 1콜 100 트레이딩봉 상한(probe #098). 캘린더 150일 ≈ 100 트레이딩봉 안전선.
DAILY_GAP_LIMIT_DAYS = 150
# 0행 티커 initial-load 대량 유실 방어 (F64, probe #122).
# 10건 초과 시 정상 신규 상장이 아니라 daily_prices 유실 정황으로 간주, 전면 skip.
INITIAL_LOAD_MAX_TICKERS = 10
KST = timezone(timedelta(hours=9))
BATCH_SIZE = 200

# ── 로깅 ──────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"prices_{datetime.today().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def kis_daily_call(token: str, ticker: str, d1: str, d2: str) -> list | None:
    """FHKST03010100 단일 호출. output2 list 반환 (실패 → None)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": KIS_APP_KEY,
        "appsecret": KIS_APP_SECRET,
        "tr_id": TR_ID,
        "custtype": "P",
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": ticker,
        "FID_INPUT_DATE_1": d1,
        "FID_INPUT_DATE_2": d2,
        "FID_PERIOD_DIV_CODE": "D",
        "FID_ORG_ADJ_PRC": "0",
    }
    try:
        r = requests.get(
            f"{DOMAIN}{API_URL}", headers=headers, params=params, timeout=15
        )
    except requests.RequestException as e:
        logger.error("KIS 호출 실패 %s [%s~%s]: %s", ticker, d1, d2, e)
        return None
    finally:
        time.sleep(CALL_GAP_SEC)
    if r.status_code != 200:
        logger.error(
            "KIS HTTP %d %s [%s~%s]: %s", r.status_code, ticker, d1, d2, r.text[:200]
        )
        return None
    try:
        body = r.json()
    except ValueError:
        logger.error("KIS JSON 파싱 실패 %s [%s~%s]", ticker, d1, d2)
        return None
    if body.get("rt_cd") != "0":
        logger.error(
            "KIS rt_cd=%s %s [%s~%s]: %s",
            body.get("rt_cd"), ticker, d1, d2,
            str(body.get("msg1", ""))[:100],
        )
        return None
    o2 = body.get("output2") or []
    if not isinstance(o2, list):
        logger.error("KIS output2 형식 오류 %s [%s~%s]", ticker, d1, d2)
        return None
    return o2


def parse_bar(raw: dict, end_iso: str, last_iso: str) -> tuple | None:
    """output2 행 → (date_iso, o, h, l, c, v). 무효 시 None.
    방어 필터: date_iso > end_iso (당일 라이브 혼입) 또는 date_iso ≤ last_iso
    (KIS 가 경계 포함 반환) 는 drop."""
    try:
        d = raw.get("stck_bsop_date")
        if not d or len(d) != 8:
            return None
        date_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
        if date_iso > end_iso or date_iso <= last_iso:
            return None
        c = int(raw.get("stck_clpr") or 0)
        if c == 0:
            return None
        o = int(raw.get("stck_oprc") or 0)
        h = int(raw.get("stck_hgpr") or 0)
        low = int(raw.get("stck_lwpr") or 0)
        v = int(raw.get("acml_vol") or 0)
        return (date_iso, o, h, low, c, v)
    except (ValueError, TypeError):
        return None


UPSERT_SQL = """
    INSERT INTO daily_prices (ticker, date, open, high, low, close, volume)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, date) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
"""


def get_all_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true")
    return [r[0] for r in cursor.fetchall()]


def get_all_last_dates(cursor) -> dict[str, date]:
    """종목별 MAX(date). 무행 종목은 dict 에서 누락."""
    cursor.execute("SELECT ticker, MAX(date) FROM daily_prices GROUP BY ticker")
    result: dict[str, date] = {}
    for ticker, max_d in cursor.fetchall():
        if max_d:
            result[ticker] = max_d
    return result


def run_one(conn, cursor, token: str, ticker: str, end: date,
            last_date: date | None, initial_load_enabled: bool) -> str:
    """반환 status ∈ {'ins','skip','warn','err'} — success/skip/warn/error 카운트용."""
    if last_date is None:
        # 게이트 차단 시 개별 로그 없이 warn — run() 시작의 총괄 ERROR 로 대체.
        if not initial_load_enabled:
            return "warn"
        d1 = end - timedelta(days=DAILY_GAP_LIMIT_DAYS)
        # parse_bar 의 date_iso <= last_iso drop 방어가 실데이터를 자르지 않도록 d1 하루 전.
        last_iso = (d1 - timedelta(days=1)).strftime("%Y-%m-%d")
        mode_tag = "[initial-load] "
        logger.info("%s[%s] 시작 (lookback=%dd, d1=%s, end=%s)",
                    mode_tag, ticker, DAILY_GAP_LIMIT_DAYS, d1, end)
    else:
        d1 = last_date + timedelta(days=1)
        if d1 > end:
            return "skip"

        gap = (end - last_date).days
        if gap > DAILY_GAP_LIMIT_DAYS:
            logger.warning(
                "[%s] gap=%d일 (last=%s, end=%s) > %d일 — 1콜 100봉 상한 초과 우려, skip. "
                "backfill_prices.py --backfill %s %s --tickers %s 사용 필요",
                ticker, gap, last_date, end, DAILY_GAP_LIMIT_DAYS,
                last_date, end, ticker,
            )
            return "warn"
        last_iso = last_date.strftime("%Y-%m-%d")
        mode_tag = ""

    d1_str = d1.strftime("%Y%m%d")
    d2_str = end.strftime("%Y%m%d")
    bars = kis_daily_call(token, ticker, d1_str, d2_str)
    if bars is None:
        return "err"

    end_iso = end.strftime("%Y-%m-%d")
    parsed: dict[str, tuple] = {}
    for raw in bars:
        p = parse_bar(raw, end_iso, last_iso)
        if p is None:
            continue
        parsed[p[0]] = p

    if not parsed:
        if last_date is None:
            logger.warning("%s[%s] KIS 응답 empty — 상장 지연 또는 티커 문제",
                           mode_tag, ticker)
        return "skip"

    rows: list[tuple] = []
    for d_iso in sorted(parsed):
        _, o, h, low, c, v = parsed[d_iso]
        rows.append((ticker, d_iso, o, h, low, c, v))

    try:
        cursor.executemany(UPSERT_SQL, rows)
        conn.commit()
    except Exception as e:
        logger.error("%s[%s] DB upsert 실패: %s", mode_tag, ticker, e)
        conn.rollback()
        return "err"

    if last_date is None:
        dates = sorted(parsed)
        logger.info("%s[%s] 적재 완료: %d행 (%s ~ %s)",
                    mode_tag, ticker, len(rows), dates[0], dates[-1])
    return "ins"


def run(end: date):
    conn = get_connection()
    cursor = conn.cursor()
    tickers = get_all_tickers(cursor)
    last_dates = get_all_last_dates(cursor)
    token = get_token(conn)
    cursor.close()
    conn.close()

    total = len(tickers)
    zero_row_tickers = [t for t in tickers if t not in last_dates]
    initial_load_enabled = True
    if len(zero_row_tickers) > INITIAL_LOAD_MAX_TICKERS:
        logger.error(
            "[initial-load] 0행 티커 %d개 > 임계 %d개 — daily_prices 대량 유실 의심, "
            "initial-load 전면 skip (증분 경로는 정상 진행). 수동 확인 필요. 목록: %s",
            len(zero_row_tickers), INITIAL_LOAD_MAX_TICKERS, zero_row_tickers,
        )
        initial_load_enabled = False
    elif zero_row_tickers:
        logger.info(
            "[initial-load] 0행 티커 %d개 대상: %s",
            len(zero_row_tickers), zero_row_tickers,
        )

    logger.info("총 %d개 종목 적재 시작 (end=%s)", total, end)

    success = skip = warn = error = 0
    conn = get_connection()
    cursor = conn.cursor()

    for i, ticker in enumerate(tickers, 1):
        if i > 1 and (i - 1) % BATCH_SIZE == 0:
            cursor.close()
            conn.close()
            conn = get_connection()
            cursor = conn.cursor()

        try:
            status = run_one(conn, cursor, token, ticker, end,
                             last_dates.get(ticker), initial_load_enabled)
        except Exception as e:
            logger.error("[%s] 처리 실패, 스킵: %s", ticker, e)
            error += 1
            continue

        if status == "ins":
            success += 1
        elif status == "skip":
            skip += 1
        elif status == "warn":
            warn += 1
        else:
            error += 1

        if i % 100 == 0:
            logger.info(
                "진행: %d/%d (성공=%d, 스킵=%d, 경고=%d, 오류=%d)",
                i, total, success, skip, warn, error,
            )

    cursor.close()
    conn.close()
    logger.info(
        "완료: 성공=%d, 스킵=%d, 경고=%d, 오류=%d",
        success, skip, warn, error,
    )

    # 대량 upsert 뒤 planner 통계 갱신. 실패는 데이터 적재 성공을 덮으면 안 되므로
    # WARNING 후 정상 종료로 흡수.
    analyze_start = time.monotonic()
    try:
        analyze_conn = get_connection()
        analyze_conn.autocommit = True
        analyze_cursor = analyze_conn.cursor()
        try:
            analyze_cursor.execute("ANALYZE daily_prices")
        finally:
            analyze_cursor.close()
            analyze_conn.close()
        logger.info(
            "[ANALYZE] daily_prices done in %.1fs",
            time.monotonic() - analyze_start,
        )
    except Exception as e:
        logger.warning("[ANALYZE] daily_prices 실패, 무시: %s", e)


def main():
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정 (collector/.env)")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        sys.exit(1)

    now_kst = datetime.now(KST)
    conn = get_connection()
    try:
        calendar = load_krx_calendar(conn)
    finally:
        conn.close()
    end = compute_expected_from_now(now_kst, calendar)
    logger.info(
        "일일 적재 시작 · now(KST)=%s · end 캡=%s",
        now_kst.strftime("%Y-%m-%d %H:%M:%S"), end,
    )
    run(end)


if __name__ == "__main__":
    main()
