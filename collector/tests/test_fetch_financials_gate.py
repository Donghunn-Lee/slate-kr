"""fetch_financials.py 게이트 유닛 테스트.

커버 대상:
  - insert_financial 분기: known non-KRW / 미등록 non-KRW / VALUE_CAP / KRW 통과
  - run() 카운터 회계: exit 판정(cap_skip > 0) 시나리오
  - check_unit_suspects Rule(1) checked 억제
"""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_financials import (  # noqa: E402
    ABS_VALUE_CAP,
    CHECKED_UNIT_SUSPECTS,
    KNOWN_NON_KRW_TICKERS,
    check_unit_suspects,
    insert_financial,
)


class InsertFinancialGateBranchTests(unittest.TestCase):
    """insert_financial 게이트 분기 반환값 검증."""

    def _base_krw_data(self) -> dict:
        # KRW·소규모 값. gate 미발동 → SQL 경로 진입.
        return {
            "revenue": 100,
            "operating_profit": 10,
            "net_income": 5,
            "total_assets": 500,
            "total_equity": 300,
            "eps": 1.0,
            "_rcept_no": "TEST_RCEPT",
        }

    def test_known_non_krw_returns_known_skip(self):
        """KNOWN_NON_KRW_TICKERS 소속 티커 + non-KRW 통화 → 'known_skip'."""
        ticker = next(iter(KNOWN_NON_KRW_TICKERS))  # 임의 known 티커
        data = {**self._base_krw_data(), "_non_krw_currency": "USD"}
        result = insert_financial(None, None, ticker, "corp", "2025", "11011", data)
        self.assertEqual(result, "known_skip")

    def test_unknown_non_krw_returns_gate_skip(self):
        """목록 밖 티커 + non-KRW → 기존 'gate_skip' 반환 (관측 연속성)."""
        self.assertNotIn("111111", KNOWN_NON_KRW_TICKERS)
        data = {**self._base_krw_data(), "_non_krw_currency": "EUR"}
        result = insert_financial(None, None, "111111", "corp", "2025", "11011", data)
        self.assertEqual(result, "gate_skip")

    def test_value_cap_returns_gate_skip(self):
        """|값| >= ABS_VALUE_CAP 이면 'gate_skip' (통화 무관, known 무관)."""
        data = {"revenue": int(ABS_VALUE_CAP) + 1, "_rcept_no": "TEST_RCEPT"}
        result = insert_financial(None, None, "111111", "corp", "2025", "11011", data)
        self.assertEqual(result, "gate_skip")

    def test_known_ticker_krw_passes_gate(self):
        """known 티커라도 currency 가 KRW 이면 gate 미발동 → INSERT 시도."""
        cursor = MagicMock()
        cursor.fetchone.return_value = (1000,)  # get_shares
        conn = MagicMock()
        ticker = next(iter(KNOWN_NON_KRW_TICKERS))
        data = self._base_krw_data()  # _non_krw_currency 없음
        result = insert_financial(conn, cursor, ticker, "corp", "2025", "11011", data)
        self.assertEqual(result, "ok")
        conn.commit.assert_called()


class RunCounterAccountingTests(unittest.TestCase):
    """run() 내부 카운터 분기가 spec 대로 exit 판정을 유도하는지 검증.

    실제 run() 은 DB·network 의존이 많아 재현이 무거우므로, 게이트 결과 →
    카운터 매핑 로직 만 fetch_financials.py 의 분기와 동일한 규칙으로 시뮬레이션.
    """

    @staticmethod
    def _tally(results_with_data):
        """(result, data) 시퀀스에서 (cap_skip, known_skip, new_non_krw, value_cap) 산출."""
        new_non_krw = value_cap = known = 0
        for result, data in results_with_data:
            if result == "known_skip":
                known += 1
            elif result == "gate_skip":
                if data.get("_non_krw_currency"):
                    new_non_krw += 1
                else:
                    value_cap += 1
        cap_skip = new_non_krw + value_cap
        return cap_skip, known, new_non_krw, value_cap

    def test_known_only_scenario_no_exit(self):
        """known non-KRW 만 존재 → cap_skip = 0 → exit 조건(>0) 거짓 (green)."""
        cap, known, non_krw, cap_v = self._tally([
            ("known_skip", {"_non_krw_currency": "USD"}),
            ("known_skip", {"_non_krw_currency": "USD"}),
            ("known_skip", {"_non_krw_currency": "CNY"}),
        ])
        self.assertEqual(cap, 0)
        self.assertEqual(known, 3)
        self.assertEqual(non_krw, 0)
        self.assertEqual(cap_v, 0)
        # exit 조건 부정: fetch_financials.py 최상위 `if total_cap_skip > 0:`
        self.assertFalse(cap > 0)

    def test_known_plus_value_cap_scenario_exit_fail(self):
        """known + 신규 non-KRW + VALUE_CAP 혼재 → cap_skip > 0 → exit 참 (fail)."""
        cap, known, non_krw, cap_v = self._tally([
            ("known_skip", {"_non_krw_currency": "USD"}),
            ("gate_skip", {"_non_krw_currency": "EUR"}),   # 신규 non-KRW
            ("gate_skip", {}),                              # VALUE_CAP
            ("gate_skip", {}),                              # VALUE_CAP
        ])
        self.assertEqual(known, 1)
        self.assertEqual(non_krw, 1)
        self.assertEqual(cap_v, 2)
        self.assertEqual(cap, 3)
        self.assertTrue(cap > 0)

    def test_only_value_cap_scenario_exit_fail(self):
        """known 0, 신규 non-KRW 0, VALUE_CAP 1 → exit 참."""
        cap, known, non_krw, cap_v = self._tally([
            ("gate_skip", {}),
        ])
        self.assertEqual(cap, 1)
        self.assertEqual(known, 0)
        self.assertEqual(non_krw, 0)
        self.assertEqual(cap_v, 1)
        self.assertTrue(cap > 0)


class CheckUnitSuspectsTests(unittest.TestCase):
    """check_unit_suspects Rule(1) checked 억제 검증."""

    @staticmethod
    def _mock_cursor(ratio_rows, cap_rows):
        cursor = MagicMock()
        # cursor.execute() 2회 호출(Rule 1, Rule 2), 각 뒤에 fetchall().
        cursor.fetchall.side_effect = [ratio_rows, cap_rows]
        return cursor

    def test_checked_pair_suppressed(self):
        """CHECKED_UNIT_SUSPECTS 소속 쌍은 개별 WARN 없이 억제."""
        checked_ticker, checked_year = next(iter(CHECKED_UNIT_SUSPECTS))
        cursor = self._mock_cursor(
            [
                (checked_ticker, checked_year, 1000, 22000, 22.0),
                ("999999", 2020, 100, 2000, 20.0),  # 신규 (억제 대상 아님)
            ],
            [],
        )
        with self.assertLogs("fetch_financials", level="INFO") as cm:
            check_unit_suspects(cursor)

        warn_texts = [r.getMessage() for r in cm.records if r.levelname == "WARNING"]
        # 억제된 쌍은 개별 WARN 없어야 함
        self.assertFalse(
            any(checked_ticker in t and str(checked_year) in t for t in warn_texts),
            f"checked 쌍 {checked_ticker}/{checked_year} 이 WARN 출력됨: {warn_texts}",
        )
        # 신규 쌍은 그대로 리포트
        self.assertTrue(any("999999" in t for t in warn_texts))

        info_texts = [r.getMessage() for r in cm.records if r.levelname == "INFO"]
        self.assertTrue(any("checked 억제" in t for t in info_texts))

    def test_all_ratio_rows_checked_no_warn(self):
        """모든 ratio 행이 checked 이면 WARN 0건, INFO 만 남음."""
        checked = list(CHECKED_UNIT_SUSPECTS)
        cursor = self._mock_cursor(
            [(t, y, 100, 2000, 20.0) for t, y in checked],
            [],
        )
        with self.assertLogs("fetch_financials", level="INFO") as cm:
            check_unit_suspects(cursor)
        warn_texts = [r.getMessage() for r in cm.records if r.levelname == "WARNING"]
        self.assertEqual(warn_texts, [])
        info_texts = [r.getMessage() for r in cm.records if r.levelname == "INFO"]
        self.assertTrue(any("checked 억제" in t for t in info_texts))

    def test_rule2_cap_unchanged(self):
        """Rule(2) [UNIT_SUSPECT_CAP] 은 억제 무관, 기존대로 WARN."""
        cursor = self._mock_cursor(
            [],
            [("999999", 2024, 3, "quarter", int(ABS_VALUE_CAP) + 1, 0, 0, 0, 0)],
        )
        with self.assertLogs("fetch_financials", level="WARNING") as cm:
            check_unit_suspects(cursor)
        warn_texts = [r.getMessage() for r in cm.records]
        self.assertTrue(any("[UNIT_SUSPECT_CAP]" in t for t in warn_texts))


if __name__ == "__main__":
    unittest.main()
