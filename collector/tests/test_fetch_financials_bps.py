"""fetch_financials.py bps 동기화 유닛 테스트.

커버 대상:
  - compute_bps: 공식·half-up 반올림·계산 불가 입력
  - plan_bps_sync 대상 판정: 같음 / 다름(절사 레거시 포함) / NULL / 격리 행 / shares 없음
  - sync_bps: 대상만 배치 UPDATE, 없으면 쓰기 없음
"""

from __future__ import annotations

import os
import sys
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_financials import compute_bps, plan_bps_sync, sync_bps  # noqa: E402


class ComputeBpsTests(unittest.TestCase):
    def test_four_decimal_places(self):
        self.assertEqual(compute_bps(10, 3), Decimal("3.3333"))
        self.assertEqual(compute_bps(20, 3), Decimal("6.6667"))

    def test_half_rounds_away_from_zero_like_sql_round(self):
        # 0.00005 → 0.0001 (Python round 은 banker's 라 0.0)
        self.assertEqual(compute_bps(5, 100000), Decimal("0.0001"))
        self.assertEqual(compute_bps(-5, 100000), Decimal("-0.0001"))

    def test_float_equity_from_dart_parse(self):
        self.assertEqual(compute_bps(300.0, 1000), Decimal("0.3000"))

    def test_uncomputable_inputs(self):
        self.assertIsNone(compute_bps(None, 1000))
        self.assertIsNone(compute_bps(300, None))
        self.assertIsNone(compute_bps(300, 0))


class PlanBpsSyncTests(unittest.TestCase):
    def test_target_selection(self):
        rows = [
            (1, 300, Decimal("0.3000"), 1000),  # 같음
            (2, 300, Decimal("0.6000"), 1000),  # shares 변경으로 다름
            (3, 10, Decimal("3.0000"), 3),  # 정수 절사 레거시
            (4, 300, None, 1000),  # NULL
            (5, None, None, 1000),  # 격리된 non-KRW 행
            (6, 300, None, None),  # shares 없음
            (7, 300, None, 0),  # shares 0 레거시
        ]
        self.assertEqual(
            plan_bps_sync(rows),
            [(2, Decimal("0.3000")), (3, Decimal("3.3333")), (4, Decimal("0.3000"))],
        )


class SyncBpsTests(unittest.TestCase):
    def test_writes_only_targets_in_one_batch(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [(1, 300, Decimal("0.3000"), 1000), (2, 300, None, 1000)]
        with patch("fetch_financials.execute_values") as ev:
            n = sync_bps(cursor)
        self.assertEqual(n, 1)
        ev.assert_called_once()
        self.assertEqual(ev.call_args.args[2], [(2, Decimal("0.3000"))])

    def test_no_targets_no_write(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [(1, 300, Decimal("0.3000"), 1000)]
        with patch("fetch_financials.execute_values") as ev:
            n = sync_bps(cursor)
        self.assertEqual(n, 0)
        ev.assert_not_called()


if __name__ == "__main__":
    unittest.main()
