"""
KIS 해외지수 일봉 대량 백필 → index_daily_prices upsert (walk-back pagination).

용도
  대량 과거 구간 백필 전용. 일일 회귀 적재는 fetch_overseas_indices.py 소관.
  기존 4종(SPX/.DJI/COMP/NDX) 은 현재 MIN(base_date) 이전 구간만 incremental,
  신규 4종(NI225/HSI/SHCOMP/DAX) 은 KIS 하한 → 오늘까지 full 백필.

호출
  GET /uapi/overseas-price/v1/quotations/inquire-daily-chartprice
  tr_id=FHKST03030100 · FID_COND_MRKT_DIV_CODE='N' · FID_PERIOD_DIV_CODE='D'
  1콜 = FID_INPUT_DATE_2 직전 100봉만 반환(하드캡, tr_cont 미동작) →
  DATE_2 를 이전 창의 가장 과거봉으로 이동해 반복 (probe 실측: 경계 1봉
  중복만 발생, dedup 로 흡수).

도메인 코드 vs KIS iscd
  DB index_code 는 정규화 표기 (NI225/HSI/SHCOMP/DAX 등). KIS 심볼
  (JP#NI225/HK#HS/SHANG/GR#DAX) 은 DOMAIN_TO_ISCD 매핑으로 격리.
  기존 4종은 identity (indices.ts · 웹 라우팅과 정합).

change / change_rate
  fetch_overseas_indices.py 컨벤션 그대로 — 전일 종가로 chain 계산.
  첫 봉(prior_close=None) → change=0, change_rate=0.

seam 재계산 (incremental 전용)
  기존 MIN 봉은 seed 시점 prior 부재로 change=0 상태. 백필 후 새로 삽입된
  직전 봉의 close 로 change/change_rate 를 UPDATE (지수당 1행).

사용
  python backfill_overseas_index_prices.py [--codes CODE ...] [--dry-run]
    · --codes 미지정 시 기본 8종 (기존 4종 incremental + 신규 4종 full)
    · --dry-run 은 KIS 조회만, DB write 없음 (walk-back / dedup 경로 확인)

규약 정합 (fetch_overseas_indices.py · backfill_index_prices.py 대칭):
  psycopg2 / load_dotenv / logs/{prefix}_{YYYYMMDD}.log /
  ON CONFLICT DO UPDATE / per-code 에러 격리.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from db import get_connection
from kis_token import get_token

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
API_URL = "/uapi/overseas-price/v1/quotations/inquire-daily-chartprice"
TR_ID = "FHKST03030100"
CALL_GAP_SEC = 0.5
# 100봉 하드캡 대비 안전 창 — 트레이딩일 100 ≈ 캘린더 140일. 여유 두고 200.
DAILY_WINDOW_DAYS = 200

# 도메인 index_code → KIS iscd. 기존 4종 identity, 신규 4종 KIS 심볼 매핑.
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

# 지수별 백필 하한 (probe 실측 근거).
# 실측 상한보다 여유있게 잡아 walk-back 이 empty 응답으로 자연 종료하도록.
#   SPX/.DJI/NI225/HSI/SHCOMP: KIS 최고봉 ~2005-08 (20050101 anchor empty)
#   COMP/DAX:                  KIS 최고봉 ~2000-08 (20000101 anchor empty)
#   NDX:                       KIS 최고봉 ~1986-08 (19850101 anchor empty)
EARLIEST_TARGET: dict[str, date] = {
    "SPX":    date(2005, 1, 1),
    ".DJI":   date(2005, 1, 1),
    "COMP":   date(2000, 1, 1),
    "NDX":    date(1985, 1, 1),
    "NI225":  date(2005, 1, 1),
    "HSI":    date(2005, 1, 1),
    "SHCOMP": date(2005, 1, 1),
    "DAX":    date(2000, 1, 1),
}

DEFAULT_CODES = tuple(DOMAIN_TO_ISCD.keys())

# ── 로깅 ──────────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"overseas_backfill_{datetime.today().strftime('%Y%m%d')}.log"
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
    """output2 행 → (date_iso, open, high, low, close, volume). 실패 시 None.
    fetch_overseas_indices.py 와 동일 규칙 (close 0 = 휴장 자리채움 drop)."""
    try:
        d = raw.get("stck_bsop_date")
        if not d or len(d) != 8:
            return None
        date_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
        close_raw = raw.get("ovrs_nmix_prpr") or raw.get("ovrs_nmix_clpr")
        if close_raw in (None, ""):
            return None
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


def walk_back(token: str, iscd: str, start: date, end: date) -> dict[str, tuple]:
    """[start, end] 범위 봉을 walk-back 으로 수집. dedup dict 반환.
    종료: empty 응답 · raw_oldest <= start · 진행 없음."""
    acc: dict[str, tuple] = {}
    cursor_end = end
    while cursor_end >= start:
        d2 = cursor_end.strftime("%Y%m%d")
        d1 = max(start, cursor_end - timedelta(days=DAILY_WINDOW_DAYS)).strftime("%Y%m%d")
        bars = kis_daily_call(token, iscd, d1, d2)
        if bars is None:
            logger.warning("%s 창 실패 [%s~%s] — 창 폭 이동 후 계속", iscd, d1, d2)
            cursor_end = cursor_end - timedelta(days=DAILY_WINDOW_DAYS)
            continue
        if not bars:
            logger.info("%s 창 빈응답 [%s~%s] → 하한 도달로 종료", iscd, d1, d2)
            break

        # raw_oldest: 창 응답의 가장 과거 봉 (필터 前) — 커서 진행 판정에 사용.
        # 필터된 acc 는 [start, end] 범위 내 봉만 저장.
        raw_oldest: str | None = None
        new_count = 0
        for raw in bars:
            d_raw = raw.get("stck_bsop_date") or ""
            if len(d_raw) == 8 and d_raw.isdigit():
                iso = f"{d_raw[0:4]}-{d_raw[4:6]}-{d_raw[6:8]}"
                if raw_oldest is None or iso < raw_oldest:
                    raw_oldest = iso
            parsed = parse_bar(raw)
            if parsed is None:
                continue
            di = parsed[0]
            if di in acc:
                continue
            di_date = datetime.strptime(di, "%Y-%m-%d").date()
            if di_date < start or di_date > end:
                continue
            acc[di] = parsed[1:]  # (o, h, l, c, v)
            new_count += 1

        if raw_oldest is None:
            logger.info("%s 창 유효봉 0 [%s~%s] → 종료", iscd, d1, d2)
            break

        logger.info(
            "%s 창 [%s~%s] 신규 %d봉 (누적 %d), raw_oldest=%s",
            iscd, d1, d2, new_count, len(acc), raw_oldest,
        )

        raw_oldest_dt = datetime.strptime(raw_oldest, "%Y-%m-%d").date()
        if raw_oldest_dt <= start:
            break
        next_end = raw_oldest_dt
        if next_end >= cursor_end:
            logger.info("%s 진행 없음 (cursor_end=%s) → 종료", iscd, cursor_end)
            break
        cursor_end = next_end
    return acc


# execute_values 배치용 SQL. VALUES %s 는 execute_values 가 튜플 목록으로 확장.
# 행 단위 executemany (실측 ~73ms/row · 4.6만 행 ≈ 57분 · SSL 절단 노출창) 대신
# 500행 배치로 라운드트립 축소.
UPSERT_SQL = """
    INSERT INTO index_daily_prices
      (index_code, base_date, open, high, low, close, change, change_rate, volume, value)
    VALUES %s
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
UPSERT_PAGE_SIZE = 500


def is_carry_bar(curr_ohlc, prev_ohlc) -> str | None:
    """KIS 휴장일 자리채움(carry) 봉 판정.

    시그니처 2종:
      (a) OHLC 4값이 직전 봉과 완전 동일       → 'OHLC=prev'
      (b) O=H=L=C 이고 close 가 직전 close 와 동일 → 'flat=prev_c'
    prev_ohlc 가 None 이면 판정 불가 → None.

    fetch_overseas_indices.py 와 동일 정의 — collector 파일들이 서로 import 하지
    않는 관례(kis_token/db 외) 유지 위해 소량 중복.
    """
    if prev_ohlc is None:
        return None
    o, h, l, c = curr_ohlc
    po, ph, pl, pc = prev_ohlc
    if o == po and h == ph and l == pl and c == pc:
        return "OHLC=prev"
    if o == h == l == c and c == pc:
        return "flat=prev_c"
    return None


def drop_carry_bars(bars_by_date: dict, latest_ohlc, log_prefix: str) -> dict:
    """정렬된 후보에 대해 순차적으로 carry 봉 drop. 첫 봉의 prev 는 latest_ohlc."""
    if not bars_by_date:
        return bars_by_date
    kept: dict = {}
    prev_ohlc = latest_ohlc
    for di in sorted(bars_by_date):
        o, h, l, c, v = bars_by_date[di]
        sig = is_carry_bar((o, h, l, c), prev_ohlc)
        if sig is not None:
            logger.info("%s carry drop %s (%s)", log_prefix, di, sig)
            continue
        kept[di] = (o, h, l, c, v)
        prev_ohlc = (o, h, l, c)
    return kept


def build_chained_tuples(index_code: str, bars_by_date: dict,
                         prior_close) -> tuple[list[tuple], object]:
    """ASC 정렬 + chain 계산 → upsert 튜플 목록.
    반환: (tuples, last_close). fetch_overseas_indices.py 컨벤션 정합."""
    tuples: list[tuple] = []
    prev_close = prior_close
    for date_iso, (o, h, low, c, v) in sorted(bars_by_date.items()):
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
            (index_code, date_iso, o, h, low, c, change, change_rate, v, 0)
        )
        prev_close = c
    return tuples, prev_close


def get_current_min(cursor, index_code: str):
    """(min_date, min_close). 없으면 (None, None)."""
    cursor.execute(
        "SELECT base_date, close FROM index_daily_prices "
        "WHERE index_code = %s ORDER BY base_date ASC LIMIT 1",
        (index_code,),
    )
    row = cursor.fetchone()
    if row is None:
        return None, None
    return row[0], row[1]


def update_seam_change(conn, cursor, index_code: str, min_date,
                       min_close, new_prev_close) -> None:
    """기존 MIN 봉의 change/change_rate 를 새로 삽입된 직전 봉 기준으로 재계산."""
    if new_prev_close in (None, Decimal("0")):
        logger.warning("[%s] seam 재계산 skip — new_prev_close 부재/0", index_code)
        return
    change = Decimal(str(min_close)) - Decimal(str(new_prev_close))
    try:
        change_rate = (change / Decimal(str(new_prev_close))) * Decimal("100")
    except InvalidOperation:
        change_rate = Decimal("0")
    cursor.execute(
        "UPDATE index_daily_prices SET change = %s, change_rate = %s "
        "WHERE index_code = %s AND base_date = %s",
        (change, change_rate, index_code, min_date),
    )
    conn.commit()
    logger.info(
        "[%s] seam 재계산: %s change=%s rate=%s (prev_close=%s)",
        index_code, min_date, change, change_rate, new_prev_close,
    )


def run_one(conn, cursor, token: str, code: str, dry_run: bool) -> dict:
    """지수 1건 처리. 반환: 상태/카운트 dict."""
    iscd = DOMAIN_TO_ISCD[code]
    start_bound = EARLIEST_TARGET[code]
    today = date.today()

    min_date, min_close = get_current_min(cursor, code)
    if min_date is not None:
        end_bound = min_date - timedelta(days=1)
        mode = "incremental"
        if end_bound < start_bound:
            logger.info(
                "[%s] 기존 MIN=%s 가 하한 <= start_bound(%s) — skip",
                code, min_date, start_bound,
            )
            return {"code": code, "mode": mode, "fetched": 0, "inserted": 0, "seam": False}
    else:
        end_bound = today
        mode = "full"

    logger.info(
        "[%s] mode=%s iscd=%s range=[%s ~ %s]",
        code, mode, iscd, start_bound, end_bound,
    )

    bars = walk_back(token, iscd, start_bound, end_bound)
    if not bars:
        logger.warning("[%s] walk-back 결과 0봉", code)
        return {"code": code, "mode": mode, "fetched": 0, "inserted": 0, "seam": False}

    # carry drop — 백필은 신규 sequence 만 처리하므로 첫 봉 prev 는 None.
    bars = drop_carry_bars(bars, latest_ohlc=None, log_prefix=f"[{code}]")

    tuples, last_close = build_chained_tuples(code, bars, prior_close=None)
    logger.info(
        "[%s] 수집 %d봉, range=%s ~ %s",
        code, len(tuples), tuples[0][1], tuples[-1][1],
    )

    if dry_run:
        logger.info("[%s] dry-run — DB write skip", code)
        return {"code": code, "mode": mode, "fetched": len(tuples), "inserted": 0, "seam": False}

    try:
        execute_values(cursor, UPSERT_SQL, tuples, page_size=UPSERT_PAGE_SIZE)
        conn.commit()
    except Exception as e:
        logger.error("[%s] upsert 실패: %s", code, e)
        conn.rollback()
        return {
            "code": code, "mode": mode,
            "fetched": len(tuples), "inserted": 0, "seam": False,
            "error": str(e),
        }

    seam_done = False
    if mode == "incremental" and min_date is not None and last_close is not None:
        # last_close 는 chain 종점 = 마지막 upsert 봉 close.
        # 그 봉의 base_date 는 정확히 end_bound (= min_date - 1) 이하 → seam prev 로 유효.
        update_seam_change(conn, cursor, code, min_date, min_close, last_close)
        seam_done = True

    return {
        "code": code, "mode": mode,
        "fetched": len(tuples), "inserted": len(tuples), "seam": seam_done,
    }


def main():
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정")
        sys.exit(1)
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="KIS 해외지수 일봉 대량 백필. 기본 8종 "
                    "(기존 4종 incremental + 신규 4종 full)."
    )
    parser.add_argument(
        "--codes", nargs="+", metavar="CODE",
        help=f"대상 도메인 코드. 기본 {list(DEFAULT_CODES)}",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="KIS 조회만 하고 DB write 없음 (walk-back / dedup / parse 확인용)",
    )
    args = parser.parse_args()

    codes = tuple(args.codes) if args.codes else DEFAULT_CODES
    for c in codes:
        if c not in DOMAIN_TO_ISCD:
            logger.error("알 수 없는 도메인 코드: %s (지원 %s)", c, list(DOMAIN_TO_ISCD))
            sys.exit(2)

    logger.info("백필 시작 · 대상=%s · dry_run=%s", list(codes), args.dry_run)

    conn = get_connection()
    cursor = conn.cursor()
    token = get_token(conn)
    total_fetched = 0
    total_inserted = 0
    total_seam = 0
    errors: list[str] = []
    try:
        for code in codes:
            try:
                r = run_one(conn, cursor, token, code, args.dry_run)
                total_fetched += r.get("fetched", 0)
                total_inserted += r.get("inserted", 0)
                if r.get("seam"):
                    total_seam += 1
                if "error" in r:
                    errors.append(f"{code}: {r['error']}")
            except Exception as e:
                logger.error("[%s] 예외, 다음 코드로 진행: %s", code, e)
                try:
                    conn.rollback()
                except Exception:
                    pass
                errors.append(f"{code}: {e}")
    finally:
        cursor.close()
        conn.close()

    logger.info(
        "백필 종료: fetched=%d inserted=%d seam_updates=%d errors=%d",
        total_fetched, total_inserted, total_seam, len(errors),
    )
    if errors:
        for e in errors:
            logger.error("실패: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
