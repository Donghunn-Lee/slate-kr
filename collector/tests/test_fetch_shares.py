"""fetch_shares.py 유닛 테스트 (DART stockTotqySttus → stocks.shares).

커버 대상:
  - parse_shares: 콤마 · 공백 · "-" · 빈 값 · 0 이하
  - is_common_label · pick_common_shares: 실측 보통주 행 표기 전부 인식 · 우선주 · 종류주 · 의결권 없는 주식 ·
    합계 무시, 보통주 행 없음은 None
  - fetch_report_shares: 013 · 보통주 행 없음(스팩) · "-" → 값 없음 / 다른 status · 요청 예외 → 오류
  - lookup_shares: 값 없음이면 prev_period 로 폴백 · MAX_REPORTS 상한 · 오류는 폴백하지 않음
  - plan_updates: 변경분만 선정 / NULL·0 → 값 / 2배·0.5배 WARN 대상 / 100배 · 1/100 밖은 적재하지 않음
  - ratio_label: 구간 경계
  - apply_updates: 변경분 없으면 쓰기 없음
  - main: 유효 응답 하한 미달이면 쓰기 없이 exit 1 · 정상이면 shares → bps 한 번에 commit ·
    비율 가드 종목은 쓰지 않음 · dry-run
"""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock, call, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_shares import (  # noqa: E402
    MAX_REPORTS,
    MIN_VALID,
    Lookup,
    apply_updates,
    fetch_report_shares,
    is_common_label,
    lookup_shares,
    main,
    parse_shares,
    pick_common_shares,
    plan_updates,
    ratio_label,
)

# probe 실측(2026-11-06) 응답 모양 — 005930 2026 반기보고서 · 스팩(0099X0) 2026 3분기보고서.
SAMSUNG_ROWS = [
    {"se": "보통주", "istc_totqy": "5,846,278,608", "tesstk_co": "82,086,705"},
    {"se": "우선주", "istc_totqy": "802,371,203", "tesstk_co": "-"},
    {"se": "합계", "istc_totqy": "6,648,649,811", "tesstk_co": "82,086,705"},
    {"se": "비고", "istc_totqy": "-", "tesstk_co": "-"},
]
SPAC_ROWS = [
    {"se": "합계", "istc_totqy": "-", "tesstk_co": "-"},
    {"se": "비고", "istc_totqy": "-", "tesstk_co": "-"},
]

# probe 실측(2026-11-06) se 표기 — '보통주' 정확 일치로 값을 못 찾은 213종목의 2026 반기보고서 전수.
# 보통주 행 표기(공백 · 줄바꿈 원문 그대로)와 그 밖의 행 표기.
COMMON_LABELS = [
    "보통주", " 보통주식", " 의결권 있는\n주식", "기명식보통주", "보통주\n(미래에셋증권)", "보통주\n(의결권 있는 주식",
    "보통주\n(의결권 있는 주식)", "보통주\n(의결권있는)", "보통주(주1)", "보통주식", "의결권\n있는 주식", "의결권\n있는주식",
    "의결권 있는\n 주식", "의결권 있는\n보통주", "의결권 있는\n주식", "의결권 있는\n주식\n(보통주식)", "의결권 있는\n주식 (보통주)",
    "의결권 있는 보통주", "의결권 있는 주식", "의결권 있는 주식\n(보통주)", "의결권 있는 주식(보통주)", "의결권이\n있는 주식", "의결권이 \n있는 주식",
    "의결권이 있는 주식", "의결권이 있는주식(보통주)", "의결권있는\n주식수", "의결권있는 주식", "의결권있는주식", "의결권있는주식\n(보통주)",
]
NON_COMMON_LABELS = [
    "  배당우선 상환주식\n(3종 종류주식)", "(종류주식)\n\n주1)", "1우선주\n(미래에셋증권우)", "1종 종류주\n(우선주식)",
    "2우선주\n(미래에셋증권2우B)", "2종 종류주\n(전환주식)", "3종 종류주\n(상환주식)", "기명식 종류주식", "기타주식",
    "배당우선\n상환주식\n(3종 종류주식)", "배당우선\n전환주식\n(2종 종류주식)", "배당우선 상환주식(3종 종류주식)", "배당우선 상환주식(4종 종류주식)",
    "배당우선 전환주식\n(1,2종 종류주식)", "배당우선 전환주식(1,2종 종류주식)", "배당우선상환주식\n(3종 종류주식)", "배당우선전환주식(2종 종류주식)",
    "배당우선주식\n(1종 종류주식)", "배당우선주식(1종 종류주식)", "비고", "우선주", "우선주\n(의결권 없는 주식)", "우선주\n(의결권없는)",
    "우선주(주2)", "우선주식", "우선주식 등", "유통주식", "의결권\n없는 주식", "의결권\n없는주식", "의결권 없는\n우선주", "의결권 없는\n주식",
    "의결권 없는 \n주식\n(종류주식)", "의결권 없는 우선주", "의결권 없는 주식", "의결권 없는 주식\n(우선주)", "의결권 없는 주식(우선주)",
    "의결권 있는 주식(우선주)", "의결권없는\n주식수", "의결권없는 주식", "의결권없는주식", "의결권없는주식\n(  -  )", "의결권없는주식\n(우선주)",
    "의결권이 \n없는 주식", "의결권이 없는 주식", "의결권이 없는주식 (우선주)", "의결권이 없는주식(우선주)", "종류주", "종류주식", "종류주식 ",
    "증류주식", "합계",
]


def _resp(body: dict) -> MagicMock:
    r = MagicMock()
    r.json.return_value = body
    return r


class ParseSharesTests(unittest.TestCase):
    def test_plain_digits(self):
        self.assertEqual(parse_shares("5846278608"), 5846278608)

    def test_commas_and_spaces(self):
        self.assertEqual(parse_shares(" 5,846,278,608 "), 5846278608)

    def test_empty_and_dash_are_invalid(self):
        self.assertIsNone(parse_shares(""))
        self.assertIsNone(parse_shares("-"))
        self.assertIsNone(parse_shares(None))

    def test_zero_and_negative_are_invalid(self):
        self.assertIsNone(parse_shares("0"))
        self.assertIsNone(parse_shares("-5"))


class CommonLabelTests(unittest.TestCase):
    def test_every_measured_common_label_matches(self):
        for label in COMMON_LABELS:
            with self.subTest(label=label):
                self.assertTrue(is_common_label(label))

    def test_no_other_measured_label_matches(self):
        for label in NON_COMMON_LABELS:
            with self.subTest(label=label):
                self.assertFalse(is_common_label(label))

    def test_missing_label(self):
        self.assertFalse(is_common_label(None))


class PickCommonSharesTests(unittest.TestCase):
    def test_common_row_only(self):
        self.assertEqual(pick_common_shares(SAMSUNG_ROWS), 5846278608)

    def test_no_common_row(self):
        self.assertIsNone(pick_common_shares(SPAC_ROWS))
        self.assertIsNone(pick_common_shares([]))

    def test_common_row_with_dash(self):
        self.assertIsNone(pick_common_shares([{"se": "보통주", "istc_totqy": "-"}]))

    def test_common_row_after_non_voting_row(self):
        # 377480 2026 반기보고서 — 의결권 없는 주식 행이 먼저 온다
        rows = [
            {"se": "의결권이 \n없는 주식", "istc_totqy": "-"},
            {"se": "의결권이 \n있는 주식", "istc_totqy": "7,229,627"},
            {"se": "합계", "istc_totqy": "7,229,627"},
        ]
        self.assertEqual(pick_common_shares(rows), 7229627)

    def test_voting_preferred_row_is_not_common(self):
        rows = [
            {"se": "의결권 있는 주식(우선주)", "istc_totqy": "100"},
            {"se": "의결권 있는 주식(보통주)", "istc_totqy": "900"},
        ]
        self.assertEqual(pick_common_shares(rows), 900)


class FetchReportSharesTests(unittest.TestCase):
    def _call(self, side_effect):
        with patch("fetch_shares.requests.get", side_effect=side_effect):
            return fetch_report_shares("corp", "2026", "11012")

    def test_value(self):
        self.assertEqual(
            self._call([_resp({"status": "000", "list": SAMSUNG_ROWS})]), (5846278608, None)
        )

    def test_no_data_and_no_common_row_are_not_errors(self):
        self.assertEqual(self._call([_resp({"status": "013"})]), (None, None))
        self.assertEqual(self._call([_resp({"status": "000", "list": SPAC_ROWS})]), (None, None))

    def test_other_status_is_error(self):
        shares, error = self._call([_resp({"status": "020", "message": "요청 제한 초과"})])
        self.assertIsNone(shares)
        self.assertIn("020", error)

    def test_request_exception_is_error(self):
        shares, error = self._call(ConnectionError("boom"))
        self.assertIsNone(shares)
        self.assertIn("boom", error)


class LookupSharesTests(unittest.TestCase):
    LATEST = ("2026", "11014")

    def _lookup(self, results):
        with patch("fetch_shares.fetch_report_shares", side_effect=results) as fetch, \
                patch("fetch_shares.time.sleep"):
            return lookup_shares("corp", self.LATEST), fetch

    def test_latest_report_hit(self):
        result, fetch = self._lookup([(100, None)])
        self.assertEqual(result, Lookup(100, 0, None))
        fetch.assert_called_once_with("corp", "2026", "11014")

    def test_no_data_falls_back_to_previous_report(self):
        # 3분기보고서 미제출(013) → 반기보고서
        result, fetch = self._lookup([(None, None), (100, None)])
        self.assertEqual(result, Lookup(100, 1, None))
        self.assertEqual(fetch.call_args_list[1], call("corp", "2026", "11012"))

    def test_stops_after_max_reports(self):
        # 스팩처럼 보통주 행이 없는 보고서만 이어지면 1년(MAX_REPORTS 개) 뒤 포기한다
        result, fetch = self._lookup([(None, None)] * (MAX_REPORTS + 1))
        self.assertEqual(result, Lookup(None, MAX_REPORTS, None))
        self.assertEqual(
            fetch.call_args_list,
            [
                call("corp", "2026", "11014"),
                call("corp", "2026", "11012"),
                call("corp", "2026", "11013"),
                call("corp", "2025", "11011"),
            ],
        )

    def test_error_does_not_fall_back(self):
        result, fetch = self._lookup([(None, "status=020 요청 제한 초과"), (100, None)])
        self.assertEqual(result, Lookup(None, 0, "status=020 요청 제한 초과"))
        fetch.assert_called_once()


class PlanUpdatesTests(unittest.TestCase):
    def setUp(self):
        current = {
            "SAME": 100,
            "NULL": None,
            "ZERO": 0,
            "MERGE": 5000,  # 5:1 병합
            "SPLIT": 100,  # 1:10 분할
            "SMALL": 1000,  # 소각
            "NOTFOUND": 300,  # 값을 못 찾음 — 기존 값 유지
        }
        found = {"SAME": 100, "NULL": 2000, "ZERO": 300, "MERGE": 1000, "SPLIT": 1000, "SMALL": 990}
        self.plan = plan_updates(found, current)

    def test_only_changed_tickers_are_updated(self):
        self.assertEqual(
            self.plan.updates,
            [("MERGE", 1000), ("NULL", 2000), ("SMALL", 990), ("SPLIT", 1000), ("ZERO", 300)],
        )

    def test_big_moves_flag_2x_and_half_but_not_fill_from_null_or_zero(self):
        flagged = {t: (old, new) for t, old, new, _ in self.plan.big_moves}
        self.assertEqual(flagged, {"MERGE": (5000, 1000), "SPLIT": (100, 1000)})

    def test_guard_ratio_skips_extremes_both_ways(self):
        # UNIT = 333430 실측(DART 값이 ×1,000). 경계 ×100 · 1/100 은 막고, ×99 · 1/99 는 적재하고 WARN
        current = {"UNIT": 30_726_747, "X100": 1000, "D100": 100_000, "X99": 1000, "D99": 99_000}
        found = {"UNIT": 30_726_747_000, "X100": 100_000, "D100": 1000, "X99": 99_000, "D99": 1000}
        plan = plan_updates(found, current)
        self.assertEqual(plan.updates, [("D99", 1000), ("X99", 99_000)])
        self.assertEqual([t for t, *_ in plan.big_moves], ["D99", "X99"])
        self.assertEqual([t for t, *_ in plan.blocked], ["D100", "UNIT", "X100"])


class RatioLabelTests(unittest.TestCase):
    def test_edges_match_big_move_bounds(self):
        self.assertEqual(ratio_label(0.2), "≤0.5")
        self.assertEqual(ratio_label(0.5), "≤0.5")
        self.assertEqual(ratio_label(2.0), "≥2")
        self.assertEqual(ratio_label(5.0), "≥2")

    def test_inner_buckets(self):
        self.assertEqual(ratio_label(0.6), "0.5~0.9")
        self.assertEqual(ratio_label(0.95), "0.9~0.99")
        self.assertEqual(ratio_label(0.995), "0.99~1")
        self.assertEqual(ratio_label(1.005), "1~1.01")
        self.assertEqual(ratio_label(1.05), "1.01~1.1")
        self.assertEqual(ratio_label(1.5), "1.1~2")


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


class MainTests(unittest.TestCase):
    ENV = {"DART_API_KEY": "k", "DATABASE_URL": "postgres://x"}

    def _main(self, argv, targets, lookups):
        conn = MagicMock()
        conn.cursor.return_value.fetchall.return_value = targets
        with patch.dict(os.environ, self.ENV), \
                patch.object(sys, "argv", ["fetch_shares.py", *argv]), \
                patch("fetch_shares.setup_logging"), \
                patch("fetch_shares.get_connection", return_value=conn), \
                patch("fetch_shares.get_available_reports",
                      return_value=[("2026", "11012"), ("2026", "11014")]), \
                patch("fetch_shares.lookup_shares",
                      side_effect=lambda corp_code, latest: lookups[corp_code]) as lookup, \
                patch("fetch_shares.apply_updates") as apply, \
                patch("fetch_shares.sync_bps", return_value=3) as sync, \
                self.assertLogs("fetch_shares", level="INFO") as logs:
            try:
                main()
                code = None
            except SystemExit as e:
                code = e.code
        self.logs = "\n".join(logs.output)
        return code, conn, lookup, apply, sync

    @staticmethod
    def _targets(n):
        return [(f"{i:06d}", f"c{i}", 5) for i in range(n)]

    def test_short_valid_response_exits_1_without_writes(self):
        targets = self._targets(MIN_VALID)
        lookups = {cc: Lookup(5, 0, None) for _, cc, _ in targets}
        lookups["c0"] = Lookup(None, MAX_REPORTS, None)
        code, conn, _, apply, sync = self._main([], targets, lookups)
        self.assertEqual(code, 1)
        apply.assert_not_called()
        sync.assert_not_called()
        conn.commit.assert_not_called()
        self.assertIn("값 없음 — 기존 값 유지 1개: 000000", self.logs)
        self.assertIn(f"유효 응답 {MIN_VALID - 1} < 하한", self.logs)

    def test_writes_changed_shares_then_bps_in_one_commit(self):
        targets = self._targets(MIN_VALID)
        lookups = {cc: Lookup(5, 1, None) for _, cc, _ in targets}
        lookups["c1"] = Lookup(10, 0, None)
        code, conn, lookup, apply, sync = self._main([], targets, lookups)
        self.assertIsNone(code)
        self.assertEqual(lookup.call_args_list[0], call("c0", ("2026", "11014")))
        apply.assert_called_once_with(conn.cursor.return_value, [("000001", 10)])
        sync.assert_called_once_with(conn.cursor.return_value)
        conn.commit.assert_called_once()
        self.assertIn(f"단계별 0=1 · 1={MIN_VALID - 1} · 2=0 · 3=0", self.logs)

    def test_guard_ratio_keeps_existing_value(self):
        targets = self._targets(MIN_VALID)
        lookups = {cc: Lookup(5, 1, None) for _, cc, _ in targets}
        lookups["c1"] = Lookup(5000, 1, None)  # ×1,000
        lookups["c2"] = Lookup(10, 1, None)  # ×2 — 적재하고 WARN
        code, conn, _, apply, sync = self._main([], targets, lookups)
        self.assertIsNone(code)
        apply.assert_called_once_with(conn.cursor.return_value, [("000002", 10)])
        sync.assert_called_once_with(conn.cursor.return_value)
        conn.commit.assert_called_once()
        self.assertIn("[SHARES_RATIO_GUARD] ticker=000001 old=5 new=5,000", self.logs)
        self.assertIn("[SHARES_BIG_MOVE] ticker=000002", self.logs)
        self.assertIn("비율 가드 skip=1", self.logs)

    def test_dry_run_writes_nothing(self):
        targets = self._targets(MIN_VALID)
        lookups = {cc: Lookup(10, 0, None) for _, cc, _ in targets}
        code, conn, _, apply, sync = self._main(["--dry-run"], targets, lookups)
        self.assertIsNone(code)
        apply.assert_not_called()
        sync.assert_not_called()
        conn.commit.assert_not_called()
        self.assertIn(f"≥2={MIN_VALID}", self.logs)


if __name__ == "__main__":
    unittest.main()
