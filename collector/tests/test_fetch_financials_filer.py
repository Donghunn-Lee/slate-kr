"""fetch_financials.py 비공시(is_financial_filer) 마킹·복귀 유닛 테스트.

커버 대상:
  - get_all_corps: 비공시 마킹 종목도 매 run 대상 (상장일 · filer 로 거르지 않음)
  - fetch_financial no_data: CFS·OFS 모두 013 일 때만 True (예외·다른 status·빈 파싱은 False)
  - run(): no_data 확정일 때만 mark_non_filer 호출
  - restore_filers: 적재 이력이 생긴 false 종목을 true 로
  - fetch_dividends 가 같은 대상 선정을 쓰는지
"""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_dividends  # noqa: E402
import fetch_financials  # noqa: E402
from fetch_financials import (  # noqa: E402
    fetch_financial,
    get_all_corps,
    restore_filers,
    run,
)


class CollectTargetTests(unittest.TestCase):
    def test_get_all_corps_keeps_non_filers(self):
        cursor = MagicMock()
        rows = [("A", "c1", "filer"), ("B", "c2", "non-filer")]
        cursor.fetchall.return_value = rows
        self.assertEqual(get_all_corps(cursor), rows)
        sql = cursor.execute.call_args.args[0]
        self.assertNotIn("listed_at", sql)
        self.assertNotIn("is_financial_filer", sql)

    def test_dividends_uses_same_selection(self):
        self.assertIs(fetch_dividends.get_all_corps, fetch_financials.get_all_corps)


def _resp(status: str, items=None) -> MagicMock:
    r = MagicMock()
    r.json.return_value = {"status": status, "list": items or []}
    return r


_VALID_ITEM = {
    "account_id": "ifrs-full_Revenue",
    "thstrm_amount": "100",
    "sj_div": "IS",
    "currency": "KRW",
    "rcept_no": "R1",
}


class FetchFinancialNoDataTests(unittest.TestCase):
    def _call(self, side_effect):
        with patch("fetch_financials.requests.get", side_effect=side_effect), \
                patch("fetch_financials.time.sleep"):
            return fetch_financial("corp", "2026", "11012", ticker="T")

    def test_both_013_is_confirmed_no_data(self):
        self.assertEqual(self._call([_resp("013"), _resp("013")]), (None, True))

    def test_other_status_is_not_confirmed(self):
        self.assertEqual(self._call([_resp("013"), _resp("020")]), (None, False))
        self.assertEqual(self._call([_resp("800"), _resp("013")]), (None, False))

    def test_request_exception_is_not_confirmed(self):
        self.assertEqual(self._call(ConnectionError("boom")), (None, False))

    def test_empty_parse_is_not_confirmed(self):
        unrelated = {**_VALID_ITEM, "account_id": "ifrs-full_Other"}
        self.assertEqual(self._call([_resp("000", [unrelated])]), (None, False))

    def test_success_returns_data(self):
        data, no_data = self._call([_resp("000", [_VALID_ITEM])])
        self.assertEqual(data["revenue"], 100.0)
        self.assertFalse(no_data)


class RunMarkingTests(unittest.TestCase):
    def _run(self, fetch_result, existing_keys=None):
        with patch("fetch_financials.get_connection"), \
                patch("fetch_financials.get_all_corps", return_value=[("T", "corp", "name")]), \
                patch("fetch_financials.fetch_financial", return_value=fetch_result), \
                patch("fetch_financials.mark_non_filer") as mark, \
                patch("fetch_financials.time.sleep"):
            run("2026", "11012", existing_keys if existing_keys is not None else set())
        return mark

    def test_confirmed_no_data_marks(self):
        self._run((None, True)).assert_called_once()

    def test_unconfirmed_failure_does_not_mark(self):
        self._run((None, False)).assert_not_called()

    def test_ticker_with_history_is_not_marked(self):
        self._run((None, True), existing_keys={("T", 2025, 4, "annual")}).assert_not_called()


class RestoreFilersTests(unittest.TestCase):
    def test_restores_non_filers_that_now_have_rows(self):
        cursor = MagicMock()
        cursor.rowcount = 8
        self.assertEqual(restore_filers(cursor), 8)
        sql = cursor.execute.call_args.args[0]
        self.assertIn("SET is_financial_filer = true", sql)
        self.assertIn("is_financial_filer = false", sql)
        self.assertIn("EXISTS (SELECT 1 FROM financial_statements", sql)


if __name__ == "__main__":
    unittest.main()
