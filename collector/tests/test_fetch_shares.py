"""fetch_shares.py 유닛 테스트.

커버 대상:
  - parse_list_shrs: 숫자 문자열·콤마·공백·빈 값·0 이하
  - plan_updates: 변경분만 선정 / NULL·0 → 값 / 무효 skip / 응답 부재 유지 / 2배·0.5배 WARN 대상
  - apply_updates: 변경분 없으면 쓰기 없음
  - main 가드: 비거래일 · 호출 실패 · 행 수 미달이면 DB 커넥션 전에 종료
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_shares  # noqa: E402
from fetch_shares import (  # noqa: E402
    KST,
    MIN_ROWS,
    apply_updates,
    main,
    parse_list_shrs,
    plan_updates,
)


def _row(ticker: str, list_shrs) -> dict:
    return {"ISU_CD": ticker, "LIST_SHRS": list_shrs}


class ParseListShrsTests(unittest.TestCase):
    def test_plain_digits(self):
        self.assertEqual(parse_list_shrs("5846278608"), 5846278608)

    def test_commas_and_spaces(self):
        self.assertEqual(parse_list_shrs(" 1,234,567 "), 1234567)

    def test_empty_and_dash_are_invalid(self):
        self.assertIsNone(parse_list_shrs(""))
        self.assertIsNone(parse_list_shrs("-"))
        self.assertIsNone(parse_list_shrs(None))

    def test_zero_and_negative_are_invalid(self):
        self.assertIsNone(parse_list_shrs("0"))
        self.assertIsNone(parse_list_shrs("-5"))


class PlanUpdatesTests(unittest.TestCase):
    def setUp(self):
        self.current = {
            "SAME": 100,
            "NULL": None,
            "ZERO": 0,
            "MERGE": 5000,  # 5:1 병합
            "SPLIT": 100,  # 1:10 분할
            "SMALL": 1000,  # 소각
            "BAD": 200,
            "GONE": 300,  # KRX 응답 부재
        }
        self.rows = [
            _row("SAME", "100"),
            _row("NULL", "2,000"),
            _row("ZERO", "300"),
            _row("MERGE", "1000"),
            _row("SPLIT", "1000"),
            _row("SMALL", "990"),
            _row("BAD", "0"),
            _row("PREF5", "77"),  # 활성 stocks 에 없는 행(우선주 등)
            _row("PREF6", "-"),
        ]
        self.plan = plan_updates(self.rows, self.current)

    def test_only_changed_active_tickers_are_updated(self):
        self.assertEqual(
            sorted(self.plan.updates),
            [("MERGE", 1000), ("NULL", 2000), ("SMALL", 990), ("SPLIT", 1000), ("ZERO", 300)],
        )

    def test_invalid_value_skips_only_that_active_ticker(self):
        self.assertEqual(self.plan.invalid, [("BAD", "0")])
        self.assertNotIn("BAD", dict(self.plan.updates))

    def test_active_ticker_missing_from_response_keeps_value(self):
        self.assertEqual(self.plan.missing, ["GONE"])
        self.assertNotIn("GONE", dict(self.plan.updates))

    def test_big_moves_flag_2x_and_half_but_not_fill_from_null_or_zero(self):
        flagged = {t: (old, new) for t, old, new, _ in self.plan.big_moves}
        self.assertEqual(flagged, {"MERGE": (5000, 1000), "SPLIT": (100, 1000)})


class ApplyUpdatesTests(unittest.TestCase):
    def test_no_updates_no_write(self):
        with patch("fetch_shares.execute_values") as ev:
            apply_updates(MagicMock(), [])
        ev.assert_not_called()

    def test_updates_are_written_in_one_batch_call(self):
        cursor = MagicMock()
        with patch("fetch_shares.execute_values") as ev:
            apply_updates(cursor, [("005930", 1), ("000660", 2)])
        ev.assert_called_once()
        self.assertEqual(ev.call_args.args[2], [("005930", 1), ("000660", 2)])


class MainGuardTests(unittest.TestCase):
    ENV = {"KRX_OPEN_API_KEY": "k", "DATABASE_URL": "postgres://x"}

    def _run(self, now: datetime, rows):
        with patch.dict(os.environ, self.ENV), \
                patch("fetch_shares.datetime") as dt, \
                patch("fetch_shares.setup_logging"), \
                patch("fetch_shares.get_latest_biz_date", return_value="20260929"), \
                patch("fetch_shares.fetch_krx_rows", return_value=rows) as fetch, \
                patch("fetch_shares.get_connection") as conn:
            dt.now.return_value = now
            try:
                main()
                code = None
            except SystemExit as e:
                code = e.code
        return code, fetch, conn

    def test_non_trading_day_skips_before_krx_and_db(self):
        code, fetch, conn = self._run(datetime(2026, 10, 9, 20, 30, tzinfo=KST), [])  # 한글날
        self.assertIsNone(code)
        fetch.assert_not_called()
        conn.assert_not_called()

    def test_call_failure_exits_1_without_db(self):
        code, _, conn = self._run(datetime(2026, 9, 30, 20, 30, tzinfo=KST), None)
        self.assertEqual(code, 1)
        conn.assert_not_called()

    def test_short_response_exits_1_without_db(self):
        rows = [_row(f"{i:06d}", "1") for i in range(MIN_ROWS - 1)]
        code, _, conn = self._run(datetime(2026, 9, 30, 20, 30, tzinfo=KST), rows)
        self.assertEqual(code, 1)
        conn.assert_not_called()

    def test_full_response_writes_shares_then_bps_in_one_commit(self):
        rows = [_row(f"{i:06d}", "10") for i in range(MIN_ROWS)]
        conn = MagicMock()
        cursor = conn.cursor.return_value
        cursor.fetchall.return_value = [("000001", 5), ("000002", 10)]
        with patch.dict(os.environ, self.ENV), \
                patch("fetch_shares.datetime") as dt, \
                patch("fetch_shares.setup_logging"), \
                patch("fetch_shares.get_latest_biz_date", return_value="20260929"), \
                patch("fetch_shares.fetch_krx_rows", return_value=rows), \
                patch("fetch_shares.get_connection", return_value=conn), \
                patch("fetch_shares.apply_updates") as apply, \
                patch("fetch_shares.sync_bps", return_value=3) as sync:
            dt.now.return_value = datetime(2026, 9, 30, 20, 30, tzinfo=KST)
            main()
        apply.assert_called_once_with(cursor, [("000001", 10)])
        sync.assert_called_once_with(cursor)
        conn.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
