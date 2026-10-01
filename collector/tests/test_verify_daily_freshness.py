"""verify_daily_freshness.py 미처리 기업행위 스캔 유닛 테스트.

커버 대상:
  - check_corp_action_range: 이탈 → 실패 사유, KNOWN_BASE_ADJ 등록 건 → 통과,
    SQL 상위 집합 중 1틱 이내 잔차 → 통과, 상한 초과 → 상위 N건 + 총계 (cursor 는 mock)
"""

from __future__ import annotations

import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_prices import KIS_DAILY_LAST_DATE  # noqa: E402
from verify_daily_freshness import (  # noqa: E402
    CORP_ACTION_REPORT_LIMIT,
    check_corp_action_range,
)

ROW_042940 = ("042940", date(2026, 9, 22), 5680, 5700, 6090)  # 권리락 — 1틱 초과 이탈


class CheckCorpActionRangeTests(unittest.TestCase):
    def check(self, rows):
        cur = MagicMock()
        cur.fetchall.return_value = rows
        with redirect_stdout(io.StringIO()):
            out = check_corp_action_range(cur)
        self.assertEqual(cur.execute.call_args[0][1], (KIS_DAILY_LAST_DATE,))
        return out

    def test_unprocessed_exit_fails(self):
        out = self.check([ROW_042940])
        self.assertEqual(len(out), 1)
        self.assertIn("042940 2026-09-22 base 5680 vs prev [L 5700, H 6090]", out[0])

    def test_known_exit_passes(self):
        known = frozenset({("042940", "2026-09-22")})
        with patch("verify_daily_freshness.KNOWN_BASE_ADJ", known):
            self.assertEqual(self.check([ROW_042940]), [])

    def test_residual_within_one_tick_passes(self):
        # SQL 은 [L, H] 밖 전부 — 1틱 허용은 판정 함수가 거른다.
        rows = [("473000", date(2026, 9, 29), 2085, 2070, 2082),
                ("900110", date(2026, 9, 18), 6010, 6009, 6009)]
        self.assertEqual(self.check(rows), [])

    def test_over_limit_reports_latest_and_total(self):
        n = CORP_ACTION_REPORT_LIMIT + 2
        rows = [("000000", date(2026, 9, 30) - timedelta(days=i), 2550, 510, 510)
                for i in range(n)]
        out = self.check(rows)
        self.assertEqual(len(out), CORP_ACTION_REPORT_LIMIT + 1)
        self.assertIn("2026-09-30", out[0])
        self.assertIn(f"total {n}", out[-1])


if __name__ == "__main__":
    unittest.main()
