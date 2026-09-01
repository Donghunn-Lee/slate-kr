"""
KIS 다종목 시세 → quote_snapshots 일일 스냅샷 (20:10 KST 캡처).

배경 (#099-7 확정 근거)
  UN(KRX+NXT 통합) 응답은 20:00 NXT 애프터 종료 후 완전 불변 상태로 유지된다.
  NXT 상장 종목은 UN.stck_prpr 이 KRX 15:30 종가가 아닌 NXT 20:00 최종가로
  확정되므로 daily_prices.close(KRX 종가)와 값이 다른 게 정상. 통합 vol/거래대금
  · 배지 감지용 nx_eligible 를 하루 1 스냅으로 굳혀 놓는 테이블.

end 시각 게이트
  거래일 & now_kst ≥ 20:05 만 실행. 그 외 시각·휴장일에 실행되면 skip 후
  정상 종료(exit 0). --force 류 우회 레버 없음(#098 end 캡 철학).

호출
  Pass 1: FHKST11300006 (intstock-multprice) UN div — 30종목/콜 * ~90콜.
  Pass 2: 동일 TR NX div — 배치당 UN 직후 연쇄. 총 ~180 콜.
  응답 순서 = 요청 순서 보존이 probe 확정(#099-7)이나, 방어적으로 응답 iscd
  로 매핑(위치 의존 금지).

nx_eligible 판정식 (probe #099-7 확정)
  NX 배치 응답에서 `prpr==0 ⇔ vol==0` 이 완전 동치(경계 모호 케이스 0).
  prpr>0 → nx_eligible=true, nx_close/nx_volume 채움.
  prpr==0 → nx_eligible=false, nx_close/nx_volume NULL(sentinel).

에러 격리
  청크(30) 단위로 UN/NX 두 콜 모두 성공한 경우에만 upsert.
  하나라도 실패면 청크 skip + error 카운트. 다음 청크 계속 진행.

규약 정합 (fetch_prices.py 대칭): psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / per-batch 커넥션 갱신은
청크 규모가 작아 생략.
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
from verify_daily_freshness import is_trading_day, load_krx_calendar

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
DOMAIN = "https://openapi.koreainvestment.com:9443"
MULTI_PATH = "/uapi/domestic-stock/v1/quotations/intstock-multprice"
TR_MULTI = "FHKST11300006"
KST = timezone(timedelta(hours=9))

CHUNK_SIZE = 30              # KIS 공식 상한 (probe #099-3)
CALL_GAP_SEC = 0.15
GATE_HOUR = 20
GATE_MIN = 5

# ── 로깅 ──────────────────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"quote_snapshots_{datetime.today().strftime('%Y%m%d')}.log"
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




# ── 게이트 (pure function — 테스트 시 mock now / calendar 주입) ──────
def is_gate_open(now_kst: datetime,
                 calendar: dict | None = None) -> tuple[bool, str]:
    """(open, reason). open=False 면 reason 메시지 반환."""
    today = now_kst.date()
    if not is_trading_day(today, calendar):
        return False, f"non-trading day ({today.isoformat()})"
    if now_kst.hour < GATE_HOUR or (
        now_kst.hour == GATE_HOUR and now_kst.minute < GATE_MIN
    ):
        return False, (
            f"before {GATE_HOUR:02d}:{GATE_MIN:02d} KST "
            f"(now={now_kst.strftime('%H:%M')})"
        )
    return True, ""


# ── KIS 다종목 콜 ────────────────────────────────────────────────────
def kis_multi(token: str, tickers: list[str], div: str) -> dict | None:
    """FHKST11300006 다종목 조회. output list 를 dict[iscd→row] 로 반환. 실패시 None.
    응답 순서 무관 — inter_shrn_iscd 로 매핑(위치 의존 금지)."""
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": KIS_APP_KEY,
        "appsecret": KIS_APP_SECRET,
        "tr_id": TR_MULTI,
        "custtype": "P",
    }
    params: dict[str, str] = {}
    for idx, t in enumerate(tickers, start=1):
        params[f"FID_COND_MRKT_DIV_CODE_{idx}"] = div
        params[f"FID_INPUT_ISCD_{idx}"] = t
    try:
        r = requests.get(
            f"{DOMAIN}{MULTI_PATH}", headers=headers, params=params, timeout=15
        )
    except requests.RequestException as e:
        logger.error("KIS multi 호출 실패 div=%s size=%d: %s", div, len(tickers), e)
        return None
    finally:
        time.sleep(CALL_GAP_SEC)
    if r.status_code != 200:
        logger.error(
            "KIS multi HTTP %d div=%s size=%d: %s",
            r.status_code, div, len(tickers), r.text[:200],
        )
        return None
    try:
        body = r.json()
    except ValueError:
        logger.error("KIS multi JSON 파싱 실패 div=%s size=%d", div, len(tickers))
        return None
    if body.get("rt_cd") != "0":
        logger.error(
            "KIS multi rt_cd=%s div=%s size=%d: %s",
            body.get("rt_cd"), div, len(tickers),
            str(body.get("msg1", ""))[:120],
        )
        return None
    output = body.get("output")
    if not isinstance(output, list):
        logger.error("KIS multi output 비-list div=%s size=%d", div, len(tickers))
        return None
    rows: dict[str, dict] = {}
    for row in output:
        if isinstance(row, dict):
            iscd = row.get("inter_shrn_iscd")
            if isinstance(iscd, str) and iscd:
                rows[iscd] = row
    return rows


# ── 파싱 ─────────────────────────────────────────────────────────────
def _int_or(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _str_num_or(v, default: str = "0") -> str:
    """numeric 컬럼용. 문자열 그대로 두면 psycopg2 가 numeric 로 안전 캐스팅."""
    if v is None or v == "":
        return default
    return str(v)


def build_row(
    ticker: str, un: dict, nx: dict | None, captured_at: datetime, snap_date: date
) -> tuple | None:
    """(ticker,date,un_close,un_change,un_change_rate,un_volume,un_value,
        nx_eligible,nx_close,nx_volume,captured_at) 튜플.
    un_close 파싱 실패시 None (에러)."""
    un_prpr = _int_or(un.get("inter2_prpr"), -1)
    if un_prpr < 0:
        return None
    un_close = _str_num_or(un.get("inter2_prpr"))
    un_change = _str_num_or(un.get("inter2_prdy_vrss"))
    un_change_rate = _str_num_or(un.get("prdy_ctrt"))
    un_volume = _int_or(un.get("acml_vol"))
    un_value_raw = un.get("acml_tr_pbmn")
    un_value = _str_num_or(un_value_raw, default="0") if un_value_raw else None

    if nx is None:
        nx_eligible = False
        nx_close = None
        nx_volume = None
    else:
        nx_prpr = _int_or(nx.get("inter2_prpr"))
        if nx_prpr > 0:
            nx_eligible = True
            nx_close = _str_num_or(nx.get("inter2_prpr"))
            nx_volume = _int_or(nx.get("acml_vol"))
        else:
            nx_eligible = False
            nx_close = None
            nx_volume = None

    return (
        ticker, snap_date, un_close, un_change, un_change_rate, un_volume,
        un_value, nx_eligible, nx_close, nx_volume, captured_at,
    )


UPSERT_SQL = """
    INSERT INTO quote_snapshots (
        ticker, date, un_close, un_change, un_change_rate, un_volume,
        un_value, nx_eligible, nx_close, nx_volume, captured_at
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, date) DO UPDATE SET
        un_close       = EXCLUDED.un_close,
        un_change      = EXCLUDED.un_change,
        un_change_rate = EXCLUDED.un_change_rate,
        un_volume      = EXCLUDED.un_volume,
        un_value       = EXCLUDED.un_value,
        nx_eligible    = EXCLUDED.nx_eligible,
        nx_close       = EXCLUDED.nx_close,
        nx_volume      = EXCLUDED.nx_volume,
        captured_at    = EXCLUDED.captured_at
"""


def get_active_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true ORDER BY ticker")
    return [r[0] for r in cursor.fetchall()]


# ── 실행 ─────────────────────────────────────────────────────────────
def run(snap_date: date, captured_at: datetime) -> int:
    """exit code 반환 (0=정상, 1=실패)."""
    conn = get_connection()
    cur = conn.cursor()
    tickers = get_active_tickers(cur)
    token = get_token(conn)
    total = len(tickers)
    logger.info(
        "quote_snapshots 캡처 시작 · date=%s · captured_at=%s · 총 %d종목",
        snap_date, captured_at.isoformat(timespec="seconds"), total,
    )

    chunk_ok = chunk_err = row_ok = row_parse_err = nx_elig = 0
    for chunk_idx in range(0, total, CHUNK_SIZE):
        chunk = tickers[chunk_idx: chunk_idx + CHUNK_SIZE]
        un_rows = kis_multi(token, chunk, "UN")
        nx_rows = kis_multi(token, chunk, "NX")
        if un_rows is None or nx_rows is None:
            chunk_err += 1
            logger.warning(
                "chunk %d [%s..%s] skip — UN/NX 응답 실패",
                chunk_idx // CHUNK_SIZE + 1, chunk[0], chunk[-1],
            )
            continue

        rows: list[tuple] = []
        for t in chunk:
            un = un_rows.get(t)
            if un is None:
                logger.warning("[%s] UN 응답 누락 — skip", t)
                row_parse_err += 1
                continue
            nx = nx_rows.get(t)  # None = 배치 응답 미포함 (관측상 없음, 방어)
            r = build_row(t, un, nx, captured_at, snap_date)
            if r is None:
                logger.warning("[%s] UN prpr 파싱 실패 — skip", t)
                row_parse_err += 1
                continue
            if r[7]:  # nx_eligible
                nx_elig += 1
            rows.append(r)

        if not rows:
            chunk_err += 1
            logger.warning(
                "chunk %d [%s..%s] 유효 row 0 — skip",
                chunk_idx // CHUNK_SIZE + 1, chunk[0], chunk[-1],
            )
            continue

        try:
            cur.executemany(UPSERT_SQL, rows)
            conn.commit()
        except Exception as e:
            conn.rollback()
            chunk_err += 1
            logger.error(
                "chunk %d [%s..%s] upsert 실패: %s",
                chunk_idx // CHUNK_SIZE + 1, chunk[0], chunk[-1], e,
            )
            continue

        chunk_ok += 1
        row_ok += len(rows)
        if chunk_ok % 20 == 0:
            logger.info(
                "진행: chunks ok=%d err=%d · rows=%d · nx_eligible=%d",
                chunk_ok, chunk_err, row_ok, nx_elig,
            )

    cur.close()
    conn.close()
    logger.info(
        "완료: chunks ok=%d err=%d · rows upsert=%d · parse_err=%d · nx_eligible=%d",
        chunk_ok, chunk_err, row_ok, row_parse_err, nx_elig,
    )
    return 0 if chunk_err == 0 else 1


def main() -> int:
    if not KIS_APP_KEY or not KIS_APP_SECRET:
        logger.error("KIS_APP_KEY / KIS_APP_SECRET 미설정 (collector/.env)")
        return 1
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL 미설정 (collector/.env)")
        return 1

    now_kst = datetime.now(KST)
    conn = get_connection()
    try:
        calendar = load_krx_calendar(conn)
    finally:
        conn.close()
    open_, reason = is_gate_open(now_kst, calendar)
    if not open_:
        logger.info(
            "gate closed — %s. skip 후 정상 종료 (--force 없음).", reason
        )
        return 0

    logger.info(
        "gate open · now(KST)=%s", now_kst.strftime("%Y-%m-%d %H:%M:%S")
    )
    return run(snap_date=now_kst.date(), captured_at=now_kst)


if __name__ == "__main__":
    sys.exit(main())
