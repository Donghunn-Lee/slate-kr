"""rescale_corp_actions.py 유닛 테스트 — DB · KIS 호출 없음.

커버 대상:
  - compute_factor · format_factor: web/sql 선례 factor 6자리 · 정수 .0
  - render_sql: 033340(거래정지) · 017650(실거래 volume ÷f) 선례 블록과 글자 단위 일치
  - decide: 통과 1건 + 거절 사유별 1건
  - is_event_ratio_ok · count_axis_jumps · build_events · recent_cutoff 경계
  - apply_block: 성공 COMMIT + 원장, 계획 대조 · rowcount · 사후 1틱 · 예외 → ROLLBACK (cursor 는 fake)
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rescale_corp_actions import (  # noqa: E402
    Block,
    Event,
    RangeStats,
    apply_block,
    build_events,
    compute_factor,
    count_axis_jumps,
    decide,
    format_factor,
    is_event_ratio_ok,
    range_stats,
    recent_cutoff,
    render_sql,
)
from verify_daily_freshness import CorpAction  # noqa: E402

SQL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "web", "sql")


def _precedent_block(filename: str, ticker: str) -> str:
    """web/sql 선례 파일에서 `-- ══ <ticker>` 블록만 (다음 블록 머리 전까지)."""
    with open(os.path.join(SQL_DIR, filename), encoding="utf-8") as fp:
        text = fp.read()
    start = text.index(f"-- ══ {ticker} ")
    end = text.find("\n-- ══ ", start + 1)
    return text[start:end if end != -1 else len(text)].rstrip("\n") + "\n"


def _stats(closes, close_911, volume=0, first=date(2026, 9, 14)) -> RangeStats:
    rows = [
        (first + timedelta(days=i), c, c, c, c, volume, c) for i, c in enumerate(closes)
    ]
    return range_stats(rows, close_911)


# 368600 10/22 실례: 거래정지 956 → 기준가 4780 (5:1 병합 추정).
ACTION_368600 = CorpAction("368600", date(2026, 10, 22), 4780, 956, 956)
STATS_368600 = _stats([956] * 20, 956)


def _event(action=ACTION_368600, **kw) -> Event:
    fields = dict(ticker_lines=1, seam_line=False, recent=True, run_lines=1)
    fields.update(kw)
    return Event(action=action, **fields)


class FactorTests(unittest.TestCase):
    def test_compute_factor_matches_precedents(self):
        self.assertEqual(compute_factor(460, 2399), 5.215217)  # 033340
        self.assertEqual(compute_factor(4140, 2072), 0.500483)  # 023150
        self.assertEqual(compute_factor(1284, 1105), 0.860592)  # 099520
        self.assertEqual(compute_factor(956, 4780), 5.0)

    def test_format_factor_keeps_decimal_point(self):
        self.assertEqual(format_factor(5.0), "5.0")
        self.assertEqual(format_factor(0.2), "0.2")
        self.assertEqual(format_factor(5.215217), "5.215217")
        self.assertEqual(format_factor(11.096606), "11.096606")


class RenderSqlTests(unittest.TestCase):
    def test_halted_block_matches_033340_precedent(self):
        stats = RangeStats(
            rows=18, first_date=date(2026, 9, 14), last_date=date(2026, 10, 13),
            min_close=460, max_close=460, first_close=460, traded_rows=0,
            close_911=460, closes=(460,) * 18,
        )
        block = Block("033340", "좋은사람들", date(2026, 10, 14), 5.215217, "1", stats, 2399)
        self.assertEqual(
            render_sql(block),
            _precedent_block("2026-10-14_rescale_033340.sql", "033340"),
        )

    def test_traded_block_matches_017650_precedent(self):
        stats = RangeStats(
            rows=17, first_date=date(2026, 9, 14), last_date=date(2026, 10, 12),
            min_close=10800, max_close=10880, first_close=10850, traded_rows=4,
            close_911=10850, closes=(10850,) * 17,
        )
        block = Block("017650", "대림제지", date(2026, 10, 13), 0.2, "1", stats, 2170)
        self.assertEqual(
            render_sql(block),
            _precedent_block("2026-10-13_rescale_corporate_actions.sql", "017650"),
        )


class DecideTests(unittest.TestCase):
    def reasons(self, event=None, kis_adj="1", f_pre=5.0, f_reload=5.0, stats=STATS_368600):
        ok, reasons = decide(event or _event(), kis_adj, f_pre, f_reload, stats)
        self.assertEqual(ok, not reasons)
        return " | ".join(reasons)

    def test_368600_passes(self):
        self.assertEqual(self.reasons(), "")

    def test_kis_adj_not_1(self):
        self.assertIn("kis_adj=0", self.reasons(kis_adj="0"))
        self.assertIn("kis_adj=unknown", self.reasons(kis_adj="unknown"))

    def test_f_pre_near_one(self):
        self.assertIn("KIS 미조정", self.reasons(f_pre=1.004, f_reload=1.004))

    def test_event_ratio_outside(self):
        self.assertIn("사건 비율 밖", self.reasons(f_pre=4.0, f_reload=4.0))

    def test_f_reload_differs(self):
        self.assertIn("f_reload=5.000001 ≠ f_pre=5.0", self.reasons(f_reload=5.000001))

    def test_multiple_lines_for_ticker(self):
        self.assertIn("종목 미처리 줄 2개", self.reasons(_event(ticker_lines=2)))

    def test_seam_line(self):
        self.assertIn("2026-09-14 줄", self.reasons(_event(seam_line=True)))

    def test_no_911_row(self):
        self.assertIn("2026-09-11 행 없음", self.reasons(stats=_stats([956] * 20, None)))

    def test_zero_prev_bar(self):  # pykrx 정지 행은 O=H=L=0
        action = CorpAction("276040", date(2026, 10, 22), 327, 0, 0)
        self.assertIn("직전 봉 L·H 0", self.reasons(_event(action)))

    def test_mixed_axis_in_range(self):  # 갭 채움 1행이 이미 새 축
        closes = [956] * 10 + [4780] + [956] * 9
        self.assertIn("구간 축 혼재", self.reasons(stats=_stats(closes, 956)))

    def test_too_many_events_in_run(self):
        self.assertIn("run 미처리 6줄 > 5", self.reasons(_event(run_lines=6)))

    def test_stale_event_date(self):
        self.assertIn("최근 5거래일 밖", self.reasons(_event(recent=False)))

    def test_kis_or_plan_failure(self):
        self.assertIn("f_pre 없음", self.reasons(f_pre=None))
        self.assertIn("f_reload 없음", self.reasons(f_reload=None))

    def test_empty_range(self):
        self.assertIn("rescale 구간 행 0", self.reasons(stats=_stats([], 956)))


class EventRatioTests(unittest.TestCase):
    def test_halted_within_one_percent(self):
        self.assertTrue(is_event_ratio_ok(5.0, 4780, 956, 956))
        self.assertTrue(is_event_ratio_ok(5.215217, 2400, 460, 460))  # 033340 — 0.04%
        self.assertFalse(is_event_ratio_ok(5.1, 4780, 956, 956))  # 2%

    def test_traded_uses_prev_bar_band_with_one_tick(self):
        # 023150 10/19: base 2275 vs [4400, 4690], f 0.500483.
        self.assertTrue(is_event_ratio_ok(0.500483, 2275, 4400, 4690))
        self.assertTrue(is_event_ratio_ok(2270 / 4690, 2275, 4400, 4690))  # 하단 − 1틱
        self.assertFalse(is_event_ratio_ok(2269 / 4690, 2275, 4400, 4690))
        self.assertFalse(is_event_ratio_ok(0.52, 2275, 4400, 4690))


class AxisJumpTests(unittest.TestCase):
    def test_normal_moves_do_not_count(self):
        self.assertEqual(count_axis_jumps([1000, 1100, 990, 1200], 5.0), 0)

    def test_new_axis_row_counts_in_and_out(self):
        self.assertEqual(count_axis_jumps([1000, 1000, 5000, 1000], 5.0), 2)

    def test_limit_down_near_half_factor_counts(self):
        # f 0.5 의 경계는 r < 0.7071 — 하한가 근처 하루도 걸려 수동으로 떨어진다(보수 쪽).
        self.assertEqual(count_axis_jumps([1000, 700], 0.5), 1)
        self.assertEqual(count_axis_jumps([1000, 710], 0.5), 0)


class BuildEventsTests(unittest.TestCase):
    def test_groups_by_ticker_and_flags_seam(self):
        actions = [
            CorpAction("368600", date(2026, 10, 22), 4780, 956, 956),
            CorpAction("111111", date(2026, 10, 21), 5000, 1000, 1000),
            CorpAction("111111", date(2026, 9, 14), 1000, 5000, 5000),
            CorpAction("222222", date(2026, 10, 8), 2000, 400, 400),
        ]
        events = build_events(actions, date(2026, 10, 16))
        self.assertEqual([e.action.ticker for e in events], ["368600", "111111", "222222"])
        self.assertEqual({e.run_lines for e in events}, {4})
        seam = events[1]
        self.assertEqual(
            (seam.action.date, seam.ticker_lines, seam.seam_line), (date(2026, 10, 21), 2, True)
        )
        self.assertEqual([e.recent for e in events], [True, True, False])


class RecentCutoffTests(unittest.TestCase):
    def test_counts_trading_days_back_including_today(self):
        self.assertEqual(recent_cutoff(date(2026, 10, 22), {}), date(2026, 10, 16))

    def test_skips_holidays(self):
        # 10/09 한글날 · 주말 — 10/14 기준 14 · 13 · 12 · 08 · 07.
        self.assertEqual(recent_cutoff(date(2026, 10, 14), {}), date(2026, 10, 7))


class FakeCursor:
    """execute 마다 (결과 행, rowcount) 를 차례로 내는 cursor."""

    def __init__(self, results):
        self.results = list(results)
        self.executed: list[str] = []
        self.rowcount = -1
        self._rows: list = []

    def execute(self, sql, params=None):
        self.executed.append(sql)
        self._rows, self.rowcount = self.results.pop(0)

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def close(self):
        pass


def _range_rows(n=3, close=956):
    return [(date(2026, 9, 14) + timedelta(days=i), close, close, close, close, 0, close)
            for i in range(n)]


BLOCK = Block(
    "368600", "아이씨에이치", date(2026, 10, 22), 5.0, "1",
    range_stats(_range_rows(), 956), 4780,
    reload_rows=(("368600", "2026-09-11", 4780, 4780, 4780, 4780, 10),),
)


def _fake_execute_values(cur, sql, rows, page_size):
    cur.execute(sql)


def _patch_execute_values():
    return patch("rescale_corp_actions.execute_values", side_effect=_fake_execute_values)


class ApplyBlockTests(unittest.TestCase):
    def run_apply(self, results):
        cur = FakeCursor(results)
        conn = MagicMock()
        conn.cursor.return_value = cur
        with _patch_execute_values():
            out = apply_block(conn, BLOCK, "123")
        return out, conn, cur

    OK_STEPS = [
        (_range_rows(), 3),  # 구간 FOR UPDATE
        ([(956,)], 1),  # 9/11 FOR UPDATE
        ([], 1),  # 재적재 upsert
        ([], 3),  # UPDATE
        ([(4780, 4780, 4780)], 1),  # 사후 — 사건일
        ([(4780, 4780, 4780)], 1),  # 사후 — 구간 첫 행
        ([], 1),  # 원장 INSERT
    ]

    def test_success_commits_with_ledger(self):
        (ok, detail), conn, cur = self.run_apply(self.OK_STEPS)
        self.assertTrue(ok)
        self.assertEqual(detail, "rows=3 reload=1")
        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()
        self.assertTrue(cur.executed[3].startswith("UPDATE daily_prices"))
        self.assertIn("INSERT INTO corp_action_rescales", cur.executed[6])

    def test_plan_mismatch_rolls_back(self):
        steps = [(_range_rows(4), 4), ([(956,)], 1)]
        (ok, reason), conn, cur = self.run_apply(steps)
        self.assertFalse(ok)
        self.assertIn("계획 대조 불일치", reason)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_update_rowcount_mismatch_rolls_back(self):
        steps = self.OK_STEPS[:3] + [([], 2)]
        (ok, reason), conn, _ = self.run_apply(steps)
        self.assertFalse(ok)
        self.assertEqual(reason, "UPDATE 2 ≠ 3")
        conn.commit.assert_not_called()

    def test_reload_rowcount_mismatch_rolls_back(self):
        steps = self.OK_STEPS[:2] + [([], 0)]
        (ok, reason), conn, _ = self.run_apply(steps)
        self.assertEqual((ok, reason), (False, "재적재 upsert 0 ≠ 1"))
        conn.commit.assert_not_called()

    def test_post_check_outside_rolls_back(self):
        steps = self.OK_STEPS[:4] + [([(4780, 956, 956)], 1)]
        (ok, reason), conn, _ = self.run_apply(steps)
        self.assertFalse(ok)
        self.assertIn("사후 1틱 이탈 — 사건일", reason)
        conn.commit.assert_not_called()

    def test_exception_rolls_back_and_raises(self):
        # 원장 INSERT 에서 결과가 소진돼 IndexError — ROLLBACK 후 삼키지 않고 올린다.
        conn = MagicMock()
        conn.cursor.return_value = FakeCursor(self.OK_STEPS[:6])
        with _patch_execute_values(), self.assertRaises(IndexError):
            apply_block(conn, BLOCK, None)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_ledger_params(self):
        cur = FakeCursor(self.OK_STEPS)
        conn = MagicMock()
        conn.cursor.return_value = cur
        params = []
        orig = cur.execute

        def spy(sql, p=None):
            params.append(p)
            orig(sql, p)

        cur.execute = spy
        with _patch_execute_values():
            apply_block(conn, BLOCK, "123")
        ticker, event_date, factor, kis_adj, rows, sql, run_id = params[-1]
        self.assertEqual((ticker, event_date, factor, kis_adj, rows, run_id),
                         ("368600", date(2026, 10, 22), Decimal("5.0"), "1", 3, "123"))
        self.assertEqual(sql, render_sql(BLOCK))


if __name__ == "__main__":
    unittest.main()
