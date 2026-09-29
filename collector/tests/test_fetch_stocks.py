"""fetch_stocks.py basDt 산출 유닛 테스트.

커버 대상:
  - get_latest_biz_date: 평일 / 월요일 / 연휴 뒤 (now(KST) 는 mock — 정적 휴장 표 기준)
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_stocks import KST, get_latest_biz_date  # noqa: E402


def _biz_date_at(y: int, m: int, d: int) -> str:
    with patch("fetch_stocks.datetime") as dt:
        dt.now.return_value = datetime(y, m, d, 10, 0, tzinfo=KST)
        return get_latest_biz_date()


class GetLatestBizDateTests(unittest.TestCase):
    def test_weekday_returns_previous_day(self):
        self.assertEqual(_biz_date_at(2026, 9, 30), "20260929")  # 수 → 화

    def test_monday_returns_friday(self):
        self.assertEqual(_biz_date_at(2026, 9, 14), "20260911")  # 월 → 금

    def test_after_holidays_skips_to_last_trading_day(self):
        # 일요일 run · 추석 연휴(9/24~25) + 주말 → 9/23(수)
        self.assertEqual(_biz_date_at(2026, 9, 27), "20260923")


if __name__ == "__main__":
    unittest.main()
