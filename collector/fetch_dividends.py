"""DART /api/alotMatter.json 으로 사업보고서(11011) 배당 정보를 받아
`dividends` 테이블에 적재한다.

fetch_financials.py 와 대칭 (엔드포인트·PK 축·incremental 스킵 축만 다름):
  · 연간 사업보고서 전용 — 분기 배당은 별도 스크립트로 처리.
  · incremental key = (ticker, year) — dividends 테이블 PK
    (ticker, year, stock_kind) 중 앞 두 축.
  · 미배당(=all NULL) 도 common 행 하나 저장해 "조회했음"을 표시.
    → 다음 실행에서 skip.
  · 우선주 응답 행이 있을 때만 preferred 행 저장.

CLI:
  --years N        최근 N개 사업연도만 처리 (기본 5).
  --tickers a,b,c  쉼표 구분 ticker 필터.
  --dry-run        DB 미접속. DART 호출 결과만 stdout.
                   corp_code 조회 DB 대신 corpCode.xml 사용 →
                   --tickers 필수 (전체 dry-run 은 의미 없음).
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import psycopg2
import requests
from dotenv import load_dotenv

from db import get_connection

# 재시도 대상 DB 예외 — fetch_financials.py 와 동일 (connection 절단류만).
_DB_RETRY_EXC = (psycopg2.OperationalError, psycopg2.InterfaceError)

load_dotenv()

# ── 로깅 설정 (fetch_financials.py 패턴) ─────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(
    _log_dir, f"dividends_{datetime.today().strftime('%Y%m%d')}.log"
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

DART_API_KEY = os.getenv("DART_API_KEY")

REPRT_CODE_ANNUAL = "11011"  # 사업보고서 — alotMatter 는 이것만.

# DART status 코드 중 "정상 skip" 취급 대상.
#   013 : 조회된 데이터가 없습니다 — 사업보고서 미공시 (신규 상장·상폐 등).
# 그 외 non-000 (010=미등록 키, 011=사용할 수 없는 키, 020=요청 초과,
# 021=회사 개수 초과, 100/101=파라미터 오류 등) 은 errors 에 합산.
# → 키 만료·한도 소진 시 silent green (0건 적재·exit 0) 방지.
# fetch_financials 의 aggregate gate 취지 대칭.
_BENIGN_STATUS = frozenset({"013"})

# period 내부 루프에서 연속 스킵 시 Neon SSL 타임아웃 방지 목적으로 재연결.
# fetch_financials.py 의 RECONNECT_EVERY(=500) 대칭.
RECONNECT_EVERY = 500

# 추출 대상 se 라벨 (공백 제거 후 비교).
# 실측 응답은 `se` 값 양옆에 공백이 있는 경우가 있어 whitespace 를 전부 제거하고
# 매칭한다.
_LABEL_DPS = "주당현금배당금(원)"
_LABEL_YIELD = "현금배당수익률(%)"
_LABEL_PAYOUT = "(연결)현금배당성향(%)"

_LABEL_TO_COL = {
    _LABEL_DPS: "dps",
    _LABEL_YIELD: "dart_yield",
    _LABEL_PAYOUT: "payout_ratio",
}

_STOCK_KND_MAP = {"보통주": "common", "우선주": "preferred"}

# ── 스키마 ────────────────────────────────────────────────
# varchar 길이는 Neon information_schema 실측 (stocks.ticker=10, corp_code=8,
# financial_statements.ticker=10) 에 맞춤. 향후 스키마 변경 시 이 세 테이블은
# 함께 조정한다.
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS dividends (
  ticker        varchar(10) NOT NULL,
  corp_code     varchar(8)  NOT NULL,
  year          int         NOT NULL,
  stock_kind    varchar(9)  NOT NULL,
  dps           numeric,
  dart_yield    numeric,
  payout_ratio  numeric,
  rcept_no      varchar(14),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, year, stock_kind)
)
"""

UPSERT_SQL = """
INSERT INTO dividends (
  ticker, corp_code, year, stock_kind,
  dps, dart_yield, payout_ratio, rcept_no
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (ticker, year, stock_kind) DO UPDATE SET
  dps = EXCLUDED.dps,
  dart_yield = EXCLUDED.dart_yield,
  payout_ratio = EXCLUDED.payout_ratio,
  rcept_no = EXCLUDED.rcept_no
"""


def _ensure_table(cursor) -> None:
    cursor.execute(CREATE_TABLE_SQL)


def _parse_value(raw: Optional[str]) -> Optional[Decimal]:
    """콤마 제거 → Decimal. '-'·''·None → None. 파싱 실패 → None (경고는 caller)."""
    if raw is None:
        return None
    s = raw.strip()
    if s == "" or s == "-":
        return None
    try:
        return Decimal(s.replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def get_available_years(years_back: int = 5) -> list[str]:
    """사업보고서(11011)가 이미 공시된 사업연도 목록 (최근 N년).

    fetch_financials.get_available_reports() 의 11011 판정 로직 복제 —
    직접 import 하면 fetch_financials 의 module-level logging.basicConfig 가
    먼저 실행되어 우리 로그가 financials_YYYYMMDD.log 로 흘러가므로 최소
    복제로 대체한다.
    """
    today = datetime.today()
    y, m = today.year, today.month
    years: list[str] = []
    for year in range(y - years_back, y + 1):
        if year < y - 1 or (year == y - 1 and m >= 4):
            years.append(str(year))
    return years


def fetch_corp_codes_from_dart() -> dict[str, str]:
    """DART corpCode.xml → {ticker: corp_code}. dry-run 전용 (DB 대체).

    update_corp_codes.fetch_corp_codes 와 동일 로직 — 그쪽 모듈을 import 하면
    corp_codes_YYYYMMDD.log 초기화 사이드이펙트가 있어 최소 복제.
    """
    url = "https://opendart.fss.or.kr/api/corpCode.xml"
    res = requests.get(url, params={"crtfc_key": DART_API_KEY}, timeout=30)
    res.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)
    mapping: dict[str, str] = {}
    for item in tree.getroot().findall("list"):
        stock_code = (item.findtext("stock_code") or "").strip()
        corp_code = (item.findtext("corp_code") or "").strip()
        if stock_code and corp_code:
            mapping[stock_code] = corp_code
    return mapping


def fetch_dividend(corp_code: str, bsns_year: str) -> tuple[Optional[dict], str]:
    """DART alotMatter.json 호출.

    반환값 (data, status):
      status == '000' : data 는 응답 dict.
      status != '000' : data 는 None. status 는 실제 DART 코드
        (013 등의 정상 skip 판정은 _BENIGN_STATUS 참조).
      요청 자체 실패 → status='ERR', data=None.

    fetch_financials.fetch_financial 과 달리 fs_div 폴백 없음 (alotMatter 는
    fs_div 파라미터 자체가 스펙에 없음).
    """
    url = "https://opendart.fss.or.kr/api/alotMatter.json"
    params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": REPRT_CODE_ANNUAL,
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
    except Exception as e:
        logger.error(
            "DART 요청 실패 corp=%s year=%s: %s", corp_code, bsns_year, e
        )
        return None, "ERR"
    status = str(data.get("status") or "")
    if status != "000":
        return None, status
    return data, "000"


def parse_dividend(
    items: list[dict],
    unmatched_sink: Optional[set] = None,
) -> tuple[dict, Optional[dict], Optional[str]]:
    """응답 list → (common_metrics, preferred_metrics|None, rcept_no).

    각 metric dict: {'dps': .., 'dart_yield': .., 'payout_ratio': ..}
    payout_ratio 는 stock_knd='-' 로 오는 경우 회사 단위 값으로 간주해
    common·preferred 양쪽에 동일 기록한다.
    응답 list 는 15행 고정 스펙이라 "우선주 행 존재" 는 사실상 항상 참 —
    행 존재만으로 저장하면 미배당 종목까지 전부 all-None preferred 를 남긴다.
    따라서 preferred 는 `dps IS NOT NULL` (실배당 있음) 일 때만 반환한다.
    unmatched_sink 가 주어지면 매칭 안 된 se 라벨을 축적 (dry-run 진단용).
    """
    common = {"dps": None, "dart_yield": None, "payout_ratio": None}
    preferred = {"dps": None, "dart_yield": None, "payout_ratio": None}
    rcept_no: Optional[str] = None

    for it in items:
        if rcept_no is None:
            rcept_no = it.get("rcept_no")
        se_raw = it.get("se") or ""
        se_key = "".join(se_raw.split())  # 공백 제거
        if se_key not in _LABEL_TO_COL:
            if unmatched_sink is not None:
                unmatched_sink.add(se_raw)
            continue
        stock_knd_raw = (it.get("stock_knd") or "").strip()
        kind = _STOCK_KND_MAP.get(stock_knd_raw)  # common/preferred/None
        raw = (it.get("thstrm") or "").strip()
        val = _parse_value(raw)
        if raw not in ("", "-") and val is None:
            logger.warning(
                "[PARSE_WARN] se=%r stock_knd=%r thstrm=%r — 파싱 실패, None 저장",
                se_raw, stock_knd_raw, raw,
            )
        col = _LABEL_TO_COL[se_key]
        if kind == "common":
            common[col] = val
        elif kind == "preferred":
            preferred[col] = val
        elif stock_knd_raw == "-" and val is not None:
            # 회사 단위 실값 (예: payout_ratio 27.88) — common/preferred 양쪽에 기록.
            # val is None ('-' 문자열 또는 빈 값) 인 경우는 무시.
            # 이유: 동일 se 가 `stock_knd={보통주, -}` 로 2행 씩 오는 라벨(dps·dart_yield)
            # 에서 stock_knd='-' 행은 항상 thstrm='-' 이라 val=None 이며,
            # 무조건 세팅하면 앞서 보통주 행에서 채운 실값을 덮어써 손실됨.
            common[col] = val
            preferred[col] = val
        # 그 외 stock_knd 는 무시.

    keep_preferred = preferred["dps"] is not None
    return (common, preferred if keep_preferred else None, rcept_no)


def get_existing_keys(cursor) -> set[tuple[str, int]]:
    cursor.execute("SELECT ticker, year FROM dividends")
    return {(row[0], row[1]) for row in cursor.fetchall()}


def get_all_corps(cursor) -> list[tuple[str, str, str]]:
    """fetch_financials.get_all_corps 와 동일 필터 — 배당 미공시 종목도
    is_financial_filer 규약 그대로 준용."""
    cursor.execute(
        """
        SELECT ticker, corp_code, name FROM stocks
        WHERE corp_code IS NOT NULL
          AND is_active = true
          AND (is_financial_filer = true OR is_financial_filer IS NULL)
        """
    )
    return cursor.fetchall()


def insert_dividend(
    conn,
    cursor,
    ticker: str,
    corp_code: str,
    year: int,
    common: dict,
    preferred: Optional[dict],
    rcept_no: Optional[str],
) -> str:
    """반환값: 'ok' | 'error'. DB 절단류는 _DB_RETRY_EXC 로 raise (caller 재시도)."""
    rows: list[tuple] = [(
        ticker, corp_code, year, "common",
        common["dps"], common["dart_yield"], common["payout_ratio"], rcept_no,
    )]
    if preferred is not None:
        rows.append((
            ticker, corp_code, year, "preferred",
            preferred["dps"], preferred["dart_yield"], preferred["payout_ratio"],
            rcept_no,
        ))
    try:
        cursor.executemany(UPSERT_SQL, rows)
        conn.commit()
    except _DB_RETRY_EXC:
        # 죽은 conn 에서 rollback 이 새 예외 유발할 수 있어 skip.
        raise
    except Exception as e:
        logger.error("DB 적재 실패 %s %d: %s", ticker, year, e)
        conn.rollback()
        return "error"
    return "ok"


def _fmt_dry_metrics(m: Optional[dict]) -> str:
    if m is None:
        return "-"
    return "dps={} yield={} payout={}".format(
        m["dps"], m["dart_yield"], m["payout_ratio"]
    )


def run_dry(years: list[str], tickers: list[str]) -> None:
    """DB 미접속. DART 호출만."""
    logger.info("[DRY] corpCode.xml 다운로드 중…")
    corp_map = fetch_corp_codes_from_dart()
    logger.info("[DRY] corpCode 매핑 수: %d", len(corp_map))

    unmatched: set[str] = set()
    for ticker in tickers:
        corp_code = corp_map.get(ticker)
        if not corp_code:
            logger.warning("[DRY] corp_code 미확인, 스킵: %s", ticker)
            continue
        for year in years:
            data, status = fetch_dividend(corp_code, year)
            if data is None:
                logger.info(
                    "[DRY] %s %s status=%s | common: - | preferred: -",
                    ticker, year, status,
                )
                time.sleep(0.05)
                continue
            items = data.get("list") or []
            common, preferred, rcept_no = parse_dividend(items, unmatched)
            logger.info(
                "[DRY] %s %s status=%s rcept=%s | common: %s | preferred: %s",
                ticker, year, status, rcept_no or "-",
                _fmt_dry_metrics(common), _fmt_dry_metrics(preferred),
            )
            time.sleep(0.15)

    if unmatched:
        logger.info(
            "[DRY] 매칭 안 된 se 라벨 (%d개): %s",
            len(unmatched), sorted(unmatched),
        )
    else:
        logger.info("[DRY] 매칭 안 된 se 라벨 없음")


def run(
    years: list[str],
    ticker_filter: Optional[set[str]],
    existing_keys: set[tuple[str, int]],
) -> tuple[int, int, int, int, dict[str, int], int]:
    """반환: (fetched, inserted_common, inserted_preferred, skipped_existing,
              status_skip_map, errors).
    errors > 0 이면 caller 가 exit 1."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        corps = get_all_corps(cursor)
    except Exception as e:
        logger.error("종목 목록 조회 실패: %s", e)
        cursor.close()
        conn.close()
        return 0, 0, 0, 0, {}, 1

    if ticker_filter is not None:
        corps = [(t, c, n) for t, c, n in corps if t in ticker_filter]

    total = len(corps)
    logger.info(
        "배당 적재 시작: years=%s, 대상 종목=%d개, 기존 키=%d",
        years, total, len(existing_keys),
    )

    fetched = 0
    inserted_common = 0
    inserted_preferred = 0
    skipped_existing = 0
    errors = 0
    status_skip: dict[str, int] = {}   # 013 등 정상 skip 만 집계
    status_error: dict[str, int] = {}  # 그 외 non-000 (errors 에 이미 합산)

    for year in years:
        year_int = int(year)
        logger.info("── year=%s 시작 ──", year)
        for i, (ticker, corp_code, _name) in enumerate(corps, 1):
            # 연속 스킵 시 Neon SSL 타임아웃 방지 재연결.
            if i > 1 and (i - 1) % RECONNECT_EVERY == 0:
                cursor.close()
                conn.close()
                conn = get_connection()
                cursor = conn.cursor()
                logger.info("[RECONNECT] year=%s — %d번째 iteration", year, i)

            key = (ticker, year_int)
            if key in existing_keys:
                skipped_existing += 1
                continue

            data, status = fetch_dividend(corp_code, year)
            fetched += 1

            if data is None:
                if status in _BENIGN_STATUS:
                    status_skip[status] = status_skip.get(status, 0) + 1
                else:
                    status_error[status] = status_error.get(status, 0) + 1
                    errors += 1
                    logger.warning(
                        "[STATUS_ERR] ticker=%s year=%s status=%s — errors 합산",
                        ticker, year, status,
                    )
                time.sleep(0.05)
                continue

            items = data.get("list") or []
            common, preferred, rcept_no = parse_dividend(items)

            try:
                result = insert_dividend(
                    conn, cursor, ticker, corp_code, year_int,
                    common, preferred, rcept_no,
                )
            except _DB_RETRY_EXC:
                logger.warning("[WARN] DB 재연결 후 재시도: %s %s", ticker, year)
                try:
                    cursor.close()
                except Exception:
                    pass
                try:
                    conn.close()
                except Exception:
                    pass
                conn = get_connection()
                cursor = conn.cursor()
                try:
                    result = insert_dividend(
                        conn, cursor, ticker, corp_code, year_int,
                        common, preferred, rcept_no,
                    )
                except _DB_RETRY_EXC as e2:
                    logger.error(
                        "[%s %s] DB 재시도 실패, 스킵: %s", ticker, year, e2
                    )
                    errors += 1
                    time.sleep(0.15)
                    continue

            if result == "ok":
                existing_keys.add(key)
                inserted_common += 1
                if preferred is not None:
                    inserted_preferred += 1
            else:
                errors += 1
            time.sleep(0.15)

            if i % 100 == 0:
                logger.info(
                    "진행 %s: %d/%d (fetched=%d, common=%d, preferred=%d, "
                    "err=%d, benign=%s, status_err=%s)",
                    year, i, total, fetched, inserted_common, inserted_preferred,
                    errors, status_skip, status_error,
                )

    logger.info(
        "완료: fetched=%d, inserted_common=%d, inserted_preferred=%d, "
        "skipped_existing=%d, errors=%d, status_skip=%s, status_error=%s",
        fetched, inserted_common, inserted_preferred, skipped_existing,
        errors, status_skip, status_error,
    )
    cursor.close()
    conn.close()
    return (
        fetched, inserted_common, inserted_preferred, skipped_existing,
        status_skip, errors,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--years", type=int, default=5,
        help="최근 N개 사업연도 처리 (기본 5).",
    )
    parser.add_argument(
        "--tickers", type=str, default=None,
        help="쉼표 구분 ticker 필터 (예: 005930,145020). 미지정 시 전체.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="DB 미접속. DART 호출 결과만 stdout.",
    )
    args = parser.parse_args()

    ticker_filter: Optional[set[str]] = None
    if args.tickers:
        ticker_filter = {t.strip() for t in args.tickers.split(",") if t.strip()}
        if not ticker_filter:
            logger.error("--tickers 파싱 실패: %s", args.tickers)
            return 1
        logger.info(
            "ticker 필터: %d개 (%s)", len(ticker_filter), sorted(ticker_filter)
        )

    years = get_available_years()[-args.years:]
    logger.info("수집 대상 사업연도 (years=%d): %s", args.years, years)

    if args.dry_run:
        if ticker_filter is None:
            logger.error(
                "--dry-run 은 --tickers 필수 (전체 dry-run 은 corpCode 로드 비용 대비 무의미)."
            )
            return 1
        run_dry(years, sorted(ticker_filter))
        return 0

    conn = get_connection()
    cursor = conn.cursor()
    try:
        _ensure_table(cursor)
        conn.commit()
        existing_keys = get_existing_keys(cursor)
        logger.info("기존 dividends 키 수: %d", len(existing_keys))
    finally:
        cursor.close()
        conn.close()

    _, _, _, _, _, errors = run(
        years=years,
        ticker_filter=ticker_filter,
        existing_keys=existing_keys,
    )

    if errors > 0:
        logger.error(
            "[EXIT] errors=%d — DB 실패 또는 DART 이상 status (013 제외). "
            "상세는 완료 로그의 status_error 참조.",
            errors,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
