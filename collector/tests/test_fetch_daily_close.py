"""fetch_daily_close.py 기업행위 감시 유닛 테스트.

커버 대상:
  - tick_size 경계: web/src/lib/get-tick-size.test.ts 와 같은 케이스
  - is_outside_prev_range: 병합·드리프트·소비율 이벤트·1틱 잔차·기준가/직전 봉 부재
  - is_ratio_outside 경계: CORP_ACTION_RATIO 안/밖, 직전 행·기준가 부재
  - get_prev_bars: close 0·NULL 행 제외
  - run: 범위 이탈만 classify_kis_adj, drift 는 KIS 콜 없음 (DB·KIS 전부 mock)
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
    get_prev_bars,
    is_outside_prev_range,
    is_ratio_outside,
    run,
    tick_size,
)


class IsRatioOutsideTests(unittest.TestCase):
    def test_within_ratio_is_not_suspected(self):
        lo, hi = CORP_ACTION_RATIO
        self.assertFalse(is_ratio_outside(1000, 1000))
        self.assertFalse(is_ratio_outside(1000, 700))  # 하한가 -30%
        self.assertFalse(is_ratio_outside(1000, 1300))  # 상한가 +30%
        self.assertFalse(is_ratio_outside(1000, int(1000 * lo)))
        self.assertFalse(is_ratio_outside(1000, int(1000 * hi)))

    def test_outside_ratio_is_suspected(self):
        self.assertTrue(is_ratio_outside(1000, 5000))  # 5:1 병합
        self.assertTrue(is_ratio_outside(1000, 200))  # 1:5 분할
        self.assertTrue(is_ratio_outside(1000, 599))
        self.assertTrue(is_ratio_outside(1000, 1501))

    def test_missing_side_is_not_suspected(self):
        self.assertFalse(is_ratio_outside(None, 5000))  # 신규 상장
        self.assertFalse(is_ratio_outside(0, 5000))
        self.assertFalse(is_ratio_outside(1000, None))  # sdpr == 0
        self.assertFalse(is_ratio_outside(1000, 0))


class GetPrevBarsTests(unittest.TestCase):
    def test_drops_zero_and_null_close(self):
        cur = MagicMock()
        d = date(2026, 9, 18)
        cur.fetchall.return_value = [
            ("A", d, 1000, 990, 1010), ("B", d, 0, 0, 0), ("C", d, None, None, None),
        ]
        self.assertEqual(
            get_prev_bars(cur, date(2026, 9, 21)), {"A": (d, 1000, 990, 1010)}
        )
        self.assertEqual(cur.execute.call_args[0][1], (date(2026, 9, 21),))


def _j_row(prpr: int, sdpr: int, vol: int = 1000) -> dict:
    return {
        "inter2_prpr": str(prpr), "inter2_sdpr": str(sdpr),
        "inter2_prdy_vrss": str(prpr - sdpr), "acml_vol": str(vol),
        "inter2_oprc": str(prpr), "inter2_hgpr": str(prpr), "inter2_lwpr": str(prpr),
    }


class RunCorpActionTests(unittest.TestCase):
    """범위 이탈만 WARN + classify_kis_adj, 범위 안 비율 이탈은 drift 로그만."""

    BAR, PREV = date(2026, 9, 29), date(2026, 9, 28)

    def test_only_range_exit_calls_kis(self):
        conn = MagicMock()
        cur = conn.cursor.return_value
        cur.fetchall.side_effect = [
            [("475830",), ("498390",), ("005930",)],  # get_active_tickers
            [  # get_prev_bars
                ("475830", self.PREV, 35500, 35500, 57500),
                ("498390", self.PREV, 2035, 2035, 2035),
                ("005930", self.PREV, 80000, 79000, 81000),
            ],
        ]
        j = {
            "475830": _j_row(54000, 53400),  # drift ×1.50 — 범위 안
            "498390": _j_row(2500, 2480),  # 스팩 재개 — 범위 이탈
            "005930": _j_row(80500, 80000),
        }
        with patch("fetch_daily_close.get_connection", return_value=conn), \
                patch("fetch_daily_close.get_token", return_value="tok"), \
                patch("fetch_daily_close.kis_multi", return_value=j), \
                patch("fetch_daily_close.classify_kis_adj",
                      return_value=("0", 2035, None)) as classify, \
                self.assertLogs("fetch_daily_close", level="INFO") as logs:
            self.assertEqual(run(self.BAR), 0)
        classify.assert_called_once_with("tok", "498390", self.PREV, self.BAR, 2035, 2480)
        warns = [r.getMessage() for r in logs.records if r.levelname == "WARNING"]
        self.assertEqual(len(warns), 1)
        self.assertIn("corporate action suspected ticker=498390", warns[0])
        drifts = [r.getMessage() for r in logs.records if r.getMessage().startswith("drift ")]
        self.assertEqual(len(drifts), 1)
        self.assertIn("ticker=475830", drifts[0])


class TickSizeTests(unittest.TestCase):
    """web/src/lib/get-tick-size.test.ts 와 같은 케이스."""

    def test_inside_bands(self):
        for price, tick in ((1, 1), (1000, 1), (3000, 5), (10000, 10), (30000, 50),
                            (100000, 100), (300000, 500), (1_000_000, 1000)):
            self.assertEqual(tick_size(price), tick, price)

    def test_boundaries_belong_to_upper_band(self):
        for price, tick in ((1999, 1), (2000, 5), (4999, 5), (5000, 10),
                            (19999, 10), (20000, 50), (49999, 50), (50000, 100),
                            (199999, 100), (200000, 500), (499999, 500), (500000, 1000)):
            self.assertEqual(tick_size(price), tick, price)

    def test_zero_is_lowest_band(self):
        self.assertEqual(tick_size(0), 1)


class IsOutsidePrevRangeTests(unittest.TestCase):
    def test_merge_after_flat_suspended_bar(self):
        # 378800 9/29 5:1 병합 — 거래정지 flat 봉(L=H) 뒤 기준가 ×5.
        self.assertTrue(is_outside_prev_range(2550, 510, 510))

    def test_after_market_drift_is_inside(self):
        # 475830 9/18 — base/close ×1.50 이지만 정규장 종가는 전일 범위 안.
        self.assertTrue(is_ratio_outside(35500, 53400))
        self.assertFalse(is_outside_prev_range(53400, 35500, 57500))

    def test_small_ratio_event_is_outside(self):
        # 220100 9/17 ×0.833 · 042940 9/22 권리락 ×0.979 — 비율 판정은 놓친다.
        self.assertFalse(is_ratio_outside(8100, 6750))
        self.assertTrue(is_outside_prev_range(6750, 8000, 8380))
        self.assertFalse(is_ratio_outside(5800, 5680))
        self.assertTrue(is_outside_prev_range(5680, 5700, 6090))

    def test_rescale_residual_within_one_tick(self):
        self.assertFalse(is_outside_prev_range(6010, 6009, 6009))  # 900110 +1원 (틱 10)
        self.assertFalse(is_outside_prev_range(2085, 2070, 2082))  # 473000 +3원 (틱 5)

    def test_one_tick_boundary(self):
        # 틱은 base 기준 — 5000 대는 10.
        self.assertFalse(is_outside_prev_range(5990, 6000, 7000))
        self.assertTrue(is_outside_prev_range(5989, 6000, 7000))
        self.assertFalse(is_outside_prev_range(7010, 6000, 7000))
        self.assertTrue(is_outside_prev_range(7011, 6000, 7000))

    def test_missing_base_or_prev_bar_is_excluded(self):
        self.assertFalse(is_outside_prev_range(None, 510, 510))  # sdpr == 0
        self.assertFalse(is_outside_prev_range(0, 510, 510))
        self.assertFalse(is_outside_prev_range(2550, None, None))  # 신규 상장


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
