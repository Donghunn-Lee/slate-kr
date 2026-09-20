"""fetch_daily_close.py 기업행위 감시 유닛 테스트.

커버 대상:
  - is_corp_action_suspected 경계: CORP_ACTION_RATIO 안/밖, 직전 행·기준가 부재
  - get_prev_closes: close 0·NULL 행 제외
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import date
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_daily_close import (  # noqa: E402
    CORP_ACTION_RATIO,
    get_prev_closes,
    is_corp_action_suspected,
)


class IsCorpActionSuspectedTests(unittest.TestCase):
    def test_within_ratio_is_not_suspected(self):
        lo, hi = CORP_ACTION_RATIO
        self.assertFalse(is_corp_action_suspected(1000, 1000))
        self.assertFalse(is_corp_action_suspected(1000, 700))  # 하한가 -30%
        self.assertFalse(is_corp_action_suspected(1000, 1300))  # 상한가 +30%
        self.assertFalse(is_corp_action_suspected(1000, int(1000 * lo)))
        self.assertFalse(is_corp_action_suspected(1000, int(1000 * hi)))

    def test_outside_ratio_is_suspected(self):
        self.assertTrue(is_corp_action_suspected(1000, 5000))  # 5:1 병합
        self.assertTrue(is_corp_action_suspected(1000, 200))  # 1:5 분할
        self.assertTrue(is_corp_action_suspected(1000, 599))
        self.assertTrue(is_corp_action_suspected(1000, 1501))

    def test_missing_side_is_not_suspected(self):
        self.assertFalse(is_corp_action_suspected(None, 5000))  # 신규 상장
        self.assertFalse(is_corp_action_suspected(0, 5000))
        self.assertFalse(is_corp_action_suspected(1000, None))  # sdpr == 0
        self.assertFalse(is_corp_action_suspected(1000, 0))


class GetPrevClosesTests(unittest.TestCase):
    def test_drops_zero_and_null_close(self):
        cur = MagicMock()
        cur.fetchall.return_value = [("A", 1000), ("B", 0), ("C", None)]
        self.assertEqual(get_prev_closes(cur, date(2026, 9, 21)), {"A": 1000})
        self.assertEqual(cur.execute.call_args[0][1], (date(2026, 9, 21),))


if __name__ == "__main__":
    unittest.main()
