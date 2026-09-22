"""fetch_daily_close.py 기업행위 감시 유닛 테스트.

커버 대상:
  - is_corp_action_suspected 경계: CORP_ACTION_RATIO 안/밖, 직전 행·기준가 부재
  - get_prev_closes: close 0·NULL 행 제외
  - classify_kis_adj: 1/0/?/unknown 판정 (kis_daily_call 은 mock — KIS 호출 없음)
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_daily_close import (  # noqa: E402
    CORP_ACTION_RATIO,
    classify_kis_adj,
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
        d = date(2026, 9, 18)
        cur.fetchall.return_value = [("A", d, 1000), ("B", d, 0), ("C", d, None)]
        self.assertEqual(get_prev_closes(cur, date(2026, 9, 21)), {"A": (d, 1000)})
        self.assertEqual(cur.execute.call_args[0][1], (date(2026, 9, 21),))


def _kis_row(ymd: str, close: int) -> dict:
    return {
        "stck_bsop_date": ymd, "stck_clpr": str(close), "stck_oprc": str(close),
        "stck_hgpr": str(close), "stck_lwpr": str(close), "acml_vol": "0",
    }


class ClassifyKisAdjTests(unittest.TestCase):
    """038530 9/21 실례: prev_close 999 → base_price 4995 (f=5, 5:1 병합)."""

    PREV, BAR = date(2026, 9, 18), date(2026, 9, 21)

    def classify(self, raw):
        with patch("fetch_daily_close.kis_daily_call", return_value=raw) as m:
            out = classify_kis_adj("tok", "038530", self.PREV, self.BAR, 999, 4995)
        m.assert_called_once_with("tok", "038530", "20260918", "20260921")
        return out

    def test_adjusted_is_1(self):
        raw = [_kis_row("20260921", 4300), _kis_row("20260918", 4995),
               _kis_row("20260917", 4995)]
        self.assertEqual(self.classify(raw), ("1", 4995, None))

    def test_adjusted_tolerates_integer_rounding(self):
        self.assertEqual(self.classify([_kis_row("20260918", 4996)]), ("1", 4996, None))
        self.assertEqual(self.classify([_kis_row("20260918", 4994)]), ("1", 4994, None))

    def test_adjusted_tolerates_tick_rounding(self):
        # 1:10 분할 — KRX 기준가 12350(호가단위 10 반올림) vs KIS 12346(정수 반올림).
        with patch("fetch_daily_close.kis_daily_call", return_value=[_kis_row("20260918", 12346)]):
            out = classify_kis_adj("tok", "000000", self.PREV, self.BAR, 123456, 12350)
        self.assertEqual(out, ("1", 12346, None))
        with patch("fetch_daily_close.kis_daily_call", return_value=[_kis_row("20260918", 12420)]):
            out = classify_kis_adj("tok", "000000", self.PREV, self.BAR, 123456, 12350)
        self.assertEqual(out, ("?", 12420, None))  # 0.5%(≈62원) 초과

    def test_unadjusted_is_0(self):
        raw = [_kis_row("20260921", 4300), _kis_row("20260918", 999)]
        self.assertEqual(self.classify(raw), ("0", 999, None))

    def test_neither_is_question(self):
        self.assertEqual(self.classify([_kis_row("20260918", 3000)]), ("?", 3000, None))

    def test_call_failure_is_unknown(self):
        self.assertEqual(self.classify(None), ("unknown", None, "KIS 호출 실패"))

    def test_missing_prev_bar_is_unknown(self):
        raw = [_kis_row("20260921", 4300), _kis_row("20260917", 999)]
        self.assertEqual(self.classify(raw), ("unknown", None, "prev_date 봉 부재"))

    def test_exception_is_isolated(self):
        with patch("fetch_daily_close.kis_daily_call", side_effect=RuntimeError("boom")):
            kis_adj, kis_prev_close, reason = classify_kis_adj(
                "tok", "038530", self.PREV, self.BAR, 999, 4995
            )
        self.assertEqual((kis_adj, kis_prev_close), ("unknown", None))
        self.assertIn("boom", reason)


if __name__ == "__main__":
    unittest.main()
