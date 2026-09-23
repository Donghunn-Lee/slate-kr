"""
KIS 다종목 시세(J) → daily_prices 당일 일봉 (20:10 KST 캡처).

일봉 정의
  KRX 20:00 마감 캔들 — 네이버·MTS 의 KRX 일봉과 같은 정의.
  O = 09:00 시가, H/L = 애프터마켓 포함, C = 20:00 마지막 체결, V = 애프터마켓 포함 누적.
  base_price = 기준가(inter2_sdpr) = 전일 15:30 정규장 종가(권리락일은 조정 기준가).
  등락률 축은 이 기준가다 — 인접 행 close 차이는 20:00 종가 대 20:00 종가라
  KIS prdy_vrss·quote_snapshots.un_change 와 어긋난다.

소스
  FHKST11300006 (intstock-multprice) J div — 30종목/콜 * ~90콜. 20:00 이후 응답은
  밤사이 정정되지 않는다. 일봉 TR(FHKST03010100)은 밤사이 C/H/L 을 정규장 값으로
  정정해 위 정의와 어긋나므로 쓰지 않는다.

행 규칙
  prpr == 0            → 미적재 + 카운트 (거래정지 등 — pykrx 갭 채움 대상)
  prpr > 0 · vol == 0  → flat 봉 O=H=L=C=prpr, V=0 (KRX 무거래일 fill 정의)
  prpr > 0 · vol > 0   → O/H/L/C/V 그대로
  sdpr == 0            → base_price NULL
  prpr − prdy_vrss ≠ sdpr 는 기준가 축 감시용 카운트만 — 적재를 막지 않는다.

기업행위 감시 (#162 F89)
  base_price / 직전 저장 close 가 CORP_ACTION_RATIO 밖이면 감자·분할·병합 등 기업행위로
  보고 WARN (corporate action suspected). 과거 봉이 KIS 수정주가 축에서 벗어나므로
  backfill_prices_kis.py --tickers 로 수동 재적재한다. 적재는 그대로 진행. 직전 행이
  없는 종목(신규 상장)은 판정 제외.
  WARN 종목은 KIS 일봉(FHKST03010100 · adj=0) 1콜로 직전 봉이 f 배 조정됐는지 판별해
  kis_adj 를 같이 남긴다 — 1(병합·분할, KIS 조정): 재적재 + 9/14 이후 행 수동 rescale
  (web/sql/rescale_corporate_action.sql) / 0(감자, KIS 미조정): 손대지 않음 /
  ?·unknown: 수동 확인. 판별 실패는 WARN 만, 적재·exit code 무관.

end 시각 게이트
  거래일 & now_kst ≥ 20:05 만 실행. 그 외 시각·휴장일에 실행되면 skip 후
  정상 종료(exit 0). --force 류 우회 레버 없음.

에러 격리
  청크(30) 단위. 콜 실패·upsert 실패는 청크 skip + error 카운트, 다음 청크 계속.
  exit 1 = 청크 에러 1건 이상.

규약 정합 (fetch_quote_snapshots.py 대칭): psycopg2 / load_dotenv /
logs/{prefix}_{YYYYMMDD}.log / ON CONFLICT DO UPDATE / per-batch 커넥션 갱신은
청크 규모가 작아 생략.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv

from db import get_connection
from fetch_prices import kis_daily_call, parse_bar
from kis_multi import CHUNK_SIZE, is_gate_open, kis_multi
from kis_token import get_token
from log_setup import setup_logging
from verify_daily_freshness import load_krx_calendar

load_dotenv()

KIS_APP_KEY = os.getenv("KIS_APP_KEY")
KIS_APP_SECRET = os.getenv("KIS_APP_SECRET")
KST = timezone(timedelta(hours=9))

# ── 로깅 ──────────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)


# ── 파싱 ─────────────────────────────────────────────────────────────
def _int_or(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def build_row(ticker: str, j: dict, bar_date: date) -> tuple | None:
    """(ticker, date, open, high, low, close, volume, base_price) 튜플.
    prpr == 0 이면 None (미적재)."""
    close = _int_or(j.get("inter2_prpr"))
    if close <= 0:
        return None
    volume = _int_or(j.get("acml_vol"))
    if volume == 0:
        open_ = high = low = close
    else:
        open_ = _int_or(j.get("inter2_oprc"))
        high = _int_or(j.get("inter2_hgpr"))
        low = _int_or(j.get("inter2_lwpr"))
    sdpr = _int_or(j.get("inter2_sdpr"))
    base_price = sdpr if sdpr > 0 else None
    return (ticker, bar_date, open_, high, low, close, volume, base_price)


def is_base_consistent(j: dict) -> bool:
    """prpr − prdy_vrss == sdpr. 기준가 축이 어긋난 응답을 세기 위한 술어."""
    return (
        _int_or(j.get("inter2_prpr")) - _int_or(j.get("inter2_prdy_vrss"))
        == _int_or(j.get("inter2_sdpr"))
    )


# ── 기업행위 감시 ─────────────────────────────────────────────────────
# 기준가는 전일 정규장 종가(권리락일은 조정 기준가). 직전 저장 close 대비 이 범위 밖이면
# 하루 등락(±30%)으로 설명되지 않는 축 변경 = 기업행위 의심.
CORP_ACTION_RATIO = (0.6, 1.5)


def get_prev_closes(cursor, bar_date: date) -> dict[str, tuple[date, int]]:
    """활성 종목별 bar_date 직전 저장 봉 (date, close). 직전 행 없는 종목은 누락.
    LATERAL + (ticker, date) 인덱스 역방향 LIMIT 1 — DISTINCT ON 은 전체 정렬로 60s 초과."""
    cursor.execute(
        """
        SELECT s.ticker, d.date, d.close
          FROM stocks s
         CROSS JOIN LATERAL (
               SELECT date, close FROM daily_prices
                WHERE ticker = s.ticker AND date < %s
                ORDER BY date DESC LIMIT 1
         ) d
         WHERE s.is_active = true
        """,
        (bar_date,),
    )
    return {t: (d, c) for t, d, c in cursor.fetchall() if c}


def is_corp_action_suspected(prev_close: int | None, base_price: int | None) -> bool:
    """base_price / prev_close 가 CORP_ACTION_RATIO 밖. 어느 쪽이든 없으면 False."""
    if not prev_close or not base_price:
        return False
    lo, hi = CORP_ACTION_RATIO
    return not (lo <= base_price / prev_close <= hi)


def classify_kis_adj(
    token: str, ticker: str, prev_date: date, bar_date: date,
    prev_close: int, base_price: int,
) -> tuple[str, int | None, str | None]:
    """WARN 종목의 KIS 수정주가 조정 여부 → (kis_adj, kis_prev_close, reason).
    KIS 일봉(FHKST03010100 · adj=0, prev_date~bar_date) 의 prev_date 봉 close 가
      == prev_close                  → "0" (미조정 — 감자. 과거 봉 손대지 않음)
      ≈ prev_close × f (±max(1, 0.5%)) → "1" (조정 — 병합·분할. 9/14 이후 행 rescale 대상)
      그 외                          → "?"
    0.5% 는 KRX 기준가의 호가단위 반올림 흡수용 — 조정(≈f) 과 미조정(≈1) 은 수십 % 차이.
    콜 실패·봉 부재·예외 → "unknown" + reason. job 을 멈추지 않는다."""
    f = base_price / prev_close
    try:
        raw = kis_daily_call(
            token, ticker, prev_date.strftime("%Y%m%d"), bar_date.strftime("%Y%m%d")
        )
        if raw is None:
            return "unknown", None, "KIS 호출 실패"
        # end=prev_date, last=prev_date−1 → parse_bar 필터로 prev_date 봉만 통과.
        end_iso = prev_date.isoformat()
        last_iso = (prev_date - timedelta(days=1)).isoformat()
        bars = [p for p in (parse_bar(r, end_iso, last_iso) for r in raw) if p]
    except Exception as e:
        return "unknown", None, f"예외 {e!r}"
    if not bars:
        return "unknown", None, "prev_date 봉 부재"
    kis_prev_close = bars[0][4]
    if kis_prev_close == prev_close:
        return "0", kis_prev_close, None
    expected = prev_close * f
    if abs(kis_prev_close - expected) <= max(1, 0.005 * expected):
        return "1", kis_prev_close, None
    return "?", kis_prev_close, None


UPSERT_SQL = """
    INSERT INTO daily_prices (ticker, date, open, high, low, close, volume, base_price)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, date) DO UPDATE SET
        open       = EXCLUDED.open,
        high       = EXCLUDED.high,
        low        = EXCLUDED.low,
        close      = EXCLUDED.close,
        volume     = EXCLUDED.volume,
        base_price = EXCLUDED.base_price
"""


def get_active_tickers(cursor) -> list[str]:
    cursor.execute("SELECT ticker FROM stocks WHERE is_active = true ORDER BY ticker")
    return [r[0] for r in cursor.fetchall()]


# ── 실행 ─────────────────────────────────────────────────────────────
def run(bar_date: date) -> int:
    """exit code 반환 (0=정상, 1=실패)."""
    conn = get_connection()
    cur = conn.cursor()
    tickers = get_active_tickers(cur)
    prev_closes = get_prev_closes(cur, bar_date)
    token = get_token(conn)
    total = len(tickers)
    logger.info("daily_prices 당일 일봉 적재 시작 · date=%s · 총 %d종목", bar_date, total)

    chunk_ok = chunk_err = row_ok = row_flat = row_skip = row_missing = 0
    base_mismatch = corp_action = 0
    kis_adj_counts = {"1": 0, "0": 0, "?": 0, "unknown": 0}
    for chunk_idx in range(0, total, CHUNK_SIZE):
        chunk = tickers[chunk_idx: chunk_idx + CHUNK_SIZE]
        j_rows = kis_multi(token, chunk, "J")
        if j_rows is None:
            chunk_err += 1
            logger.warning(
                "chunk %d [%s..%s] skip — J 응답 실패",
                chunk_idx // CHUNK_SIZE + 1, chunk[0], chunk[-1],
            )
            continue

        rows: list[tuple] = []
        for t in chunk:
            j = j_rows.get(t)
            if j is None:
                logger.warning("[%s] J 응답 누락 — skip", t)
                row_missing += 1
                continue
            r = build_row(t, j, bar_date)
            if r is None:
                row_skip += 1
                continue
            if r[6] == 0:  # volume
                row_flat += 1
            if not is_base_consistent(j):
                base_mismatch += 1
            prev_date, prev_close = prev_closes.get(t, (None, None))
            if is_corp_action_suspected(prev_close, r[7]):
                corp_action += 1
                kis_adj, kis_prev_close, reason = classify_kis_adj(
                    token, t, prev_date, bar_date, prev_close, r[7]
                )
                kis_adj_counts[kis_adj] += 1
                logger.warning(
                    "corporate action suspected ticker=%s prev_close=%s base_price=%s "
                    "f=%.2f kis_adj=%s kis_prev_close=%s%s",
                    t, prev_close, r[7], r[7] / prev_close, kis_adj, kis_prev_close,
                    f" reason={reason}" if reason else "",
                )
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
                "진행: chunks ok=%d err=%d · rows=%d · flat=%d · skip(prpr=0)=%d",
                chunk_ok, chunk_err, row_ok, row_flat, row_skip,
            )

    cur.close()
    conn.close()
    logger.info(
        "완료: 대상=%d · chunks ok=%d err=%d · rows upsert=%d (flat=%d) · "
        "skip(prpr=0)=%d · 응답 누락=%d · base 불일치(prpr−prdy_vrss≠sdpr)=%d · "
        "기업행위 의심=%d (adj 1=%d 0=%d ?=%d unknown=%d)",
        total, chunk_ok, chunk_err, row_ok, row_flat, row_skip, row_missing,
        base_mismatch, corp_action, kis_adj_counts["1"], kis_adj_counts["0"],
        kis_adj_counts["?"], kis_adj_counts["unknown"],
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

    return 0 if chunk_err == 0 else 1


def main() -> int:
    setup_logging("daily_close")
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
    return run(bar_date=now_kst.date())


if __name__ == "__main__":
    sys.exit(main())
