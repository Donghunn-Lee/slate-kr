"""fetch_financials.py 게이트 유닛 테스트.

커버 대상:
  - insert_financial 분기: known non-KRW / 미등록 non-KRW / VALUE_CAP / KRW 통과 / known 통화 미표기
  - run() 카운터 회계: exit 판정(cap_skip > 0) 시나리오
  - non-KRW 자동 격리: prev_period · decide_non_krw_isolation 게이트 · isolate_non_krw 트랜잭션
    · try_isolate_non_krw 의 상태 갱신
  - main() exit 판정: 종목 목록 조회가 전 period 실패면 exit 1
  - check_unit_suspects Rule(1) checked 억제
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import DEFAULT, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_financials  # noqa: E402
from fetch_financials import (  # noqa: E402
    ABS_VALUE_CAP,
    CHECKED_UNIT_SUSPECTS,
    MAX_NON_KRW_ISOLATIONS_PER_RUN,
    NonKrwRun,
    check_unit_suspects,
    decide_non_krw_isolation,
    insert_financial,
    isolate_non_krw,
    prev_period,
    try_isolate_non_krw,
)

KNOWN = {"241560": "USD", "900110": "CNY"}


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
            "_currencies": {"KRW"},
        }

    def test_known_non_krw_returns_known_skip(self):
        data = {**self._base_krw_data(), "_non_krw_currency": "USD", "_currencies": {"USD"}}
        result = insert_financial(
            None, None, "241560", "corp", "2025", "11011", data, known_non_krw=KNOWN
        )
        self.assertEqual(result, "known_skip")

    def test_unknown_non_krw_returns_gate_skip(self):
        """목록 밖 티커 + non-KRW → 'gate_skip' (호출측이 격리를 시도한다)."""
        data = {**self._base_krw_data(), "_non_krw_currency": "EUR", "_currencies": {"EUR"}}
        result = insert_financial(
            None, None, "111111", "corp", "2025", "11011", data, known_non_krw=KNOWN
        )
        self.assertEqual(result, "gate_skip")

    def test_value_cap_returns_gate_skip(self):
        """|값| >= ABS_VALUE_CAP 이면 'gate_skip' (통화 무관, known 무관)."""
        data = {"revenue": int(ABS_VALUE_CAP) + 1, "_rcept_no": "TEST_RCEPT"}
        result = insert_financial(None, None, "111111", "corp", "2025", "11011", data)
        self.assertEqual(result, "gate_skip")

    def test_known_ticker_explicit_krw_passes_gate(self):
        """known 티커라도 currency 가 KRW 로 명시되면 gate 미발동 → INSERT 시도."""
        cursor = MagicMock()
        cursor.fetchone.return_value = (1000,)  # get_shares
        conn = MagicMock()
        result = insert_financial(
            conn, cursor, "241560", "corp", "2025", "11011", self._base_krw_data(),
            known_non_krw=KNOWN,
        )
        self.assertEqual(result, "ok")
        conn.commit.assert_called()

    def test_known_ticker_without_currency_tag_is_known_skip(self):
        """known 티커의 통화 미표기 공시는 KRW 복귀 근거가 아니다 — 외화 금액 적재 방지."""
        conn, cursor = MagicMock(), MagicMock()
        data = {**self._base_krw_data(), "_currencies": set()}
        result = insert_financial(
            conn, cursor, "241560", "corp", "2025", "11011", data, known_non_krw=KNOWN
        )
        self.assertEqual(result, "known_skip")
        cursor.execute.assert_not_called()

    def test_unknown_ticker_without_currency_tag_loads(self):
        """미등록 티커의 통화 미표기 공시는 KRW 로 본다 (기존 적재 경로)."""
        cursor = MagicMock()
        cursor.fetchone.return_value = (1000,)
        conn = MagicMock()
        data = {**self._base_krw_data(), "_currencies": set()}
        result = insert_financial(
            conn, cursor, "111111", "corp", "2025", "11011", data, known_non_krw=KNOWN
        )
        self.assertEqual(result, "ok")


class RunCounterAccountingTests(unittest.TestCase):
    """run() 내부 카운터 분기가 spec 대로 exit 판정을 유도하는지 검증.

    실제 run() 은 DB·network 의존이 많아 재현이 무거우므로, 게이트 결과 →
    카운터 매핑 로직 만 fetch_financials.py 의 분기와 동일한 규칙으로 시뮬레이션.
    """

    @staticmethod
    def _tally(results_with_data):
        """(result, data, isolated) 시퀀스에서 (cap_skip, known, new_non_krw, value_cap, isolated) 산출."""
        new_non_krw = value_cap = known = isolated_n = 0
        for result, data, isolated in results_with_data:
            if result == "known_skip":
                known += 1
            elif result == "gate_skip":
                if data.get("_non_krw_currency"):
                    if isolated:
                        isolated_n += 1
                    else:
                        new_non_krw += 1
                else:
                    value_cap += 1
        cap_skip = new_non_krw + value_cap
        return cap_skip, known, new_non_krw, value_cap, isolated_n

    def test_known_only_scenario_no_exit(self):
        """known non-KRW 만 존재 → cap_skip = 0 → exit 조건(>0) 거짓 (green)."""
        cap, known, non_krw, cap_v, iso = self._tally([
            ("known_skip", {"_non_krw_currency": "USD"}, False),
            ("known_skip", {"_non_krw_currency": "USD"}, False),
            ("known_skip", {"_non_krw_currency": "CNY"}, False),
        ])
        self.assertEqual((cap, known, non_krw, cap_v, iso), (0, 3, 0, 0, 0))
        self.assertFalse(cap > 0)

    def test_isolated_new_non_krw_no_exit(self):
        """신규 non-KRW 가 격리까지 통과하면 cap_skip 미기여 (green)."""
        cap, known, non_krw, cap_v, iso = self._tally([
            ("gate_skip", {"_non_krw_currency": "JPY"}, True),
        ])
        self.assertEqual((cap, non_krw, iso), (0, 0, 1))
        self.assertFalse(cap > 0)

    def test_declined_plus_value_cap_scenario_exit_fail(self):
        """known + 격리 거절 non-KRW + VALUE_CAP 혼재 → cap_skip > 0 → exit 참 (fail)."""
        cap, known, non_krw, cap_v, iso = self._tally([
            ("known_skip", {"_non_krw_currency": "USD"}, False),
            ("gate_skip", {"_non_krw_currency": "EUR"}, False),  # 격리 거절
            ("gate_skip", {}, False),                             # VALUE_CAP
            ("gate_skip", {}, False),                             # VALUE_CAP
        ])
        self.assertEqual((known, non_krw, cap_v, cap), (1, 1, 2, 3))
        self.assertTrue(cap > 0)

    def test_only_value_cap_scenario_exit_fail(self):
        cap, known, non_krw, cap_v, iso = self._tally([("gate_skip", {}, False)])
        self.assertEqual((cap, known, non_krw, cap_v), (1, 0, 0, 1))
        self.assertTrue(cap > 0)


class PrevPeriodTests(unittest.TestCase):
    def test_quarters_step_back_within_year(self):
        self.assertEqual(prev_period("2026", "11012"), ("2026", "11013"))
        self.assertEqual(prev_period("2026", "11014"), ("2026", "11012"))
        self.assertEqual(prev_period("2026", "11011"), ("2026", "11014"))

    def test_q1_steps_back_to_prior_annual(self):
        self.assertEqual(prev_period("2026", "11013"), ("2025", "11011"))


def _state(tmp: str | None = None) -> NonKrwRun:
    state = NonKrwRun("20260101_000000", None)
    if tmp is not None:
        state.out_dir = tmp
    return state


class DecideNonKrwIsolationTests(unittest.TestCase):
    """격리 게이트 — 거절 사유별 분기. fetch_financial 은 직전 period 조회용으로 교체."""

    JPY = {"_non_krw_currency": "JPY", "_currencies": {"JPY"}, "_rcept_no": "R"}

    def _decide(self, data, prev, n_rows=20, state=None):
        cursor = MagicMock()
        cursor.fetchone.return_value = (n_rows,)
        with patch.object(fetch_financials, "fetch_financial", return_value=prev) as ff:
            result = decide_non_krw_isolation(
                cursor, "950170", "corp", "2026", "11012", data, state or _state()
            )
        return result, ff

    def test_prev_same_currency_passes(self):
        (currency, note), ff = self._decide(self.JPY, ({"_currencies": {"JPY"}}, False))
        self.assertEqual((currency, note), ("JPY", ""))
        ff.assert_called_once_with("corp", "2026", "11013", ticker="950170")

    def test_mixed_currencies_declined_before_dart_call(self):
        data = {**self.JPY, "_currencies": {"JPY", "KRW"}}
        (currency, note), ff = self._decide(data, ({"_currencies": {"JPY"}}, False))
        self.assertIsNone(currency)
        self.assertIn("혼재", note)
        ff.assert_not_called()

    def test_budget_exhausted_declined(self):
        state = _state()
        state.remaining = 0
        (currency, note), _ = self._decide(
            self.JPY, ({"_currencies": {"JPY"}}, False), state=state
        )
        self.assertIsNone(currency)
        self.assertIn(str(MAX_NON_KRW_ISOLATIONS_PER_RUN), note)

    def test_prev_krw_declined(self):
        """직전 period 가 KRW 면 진짜 전환이거나 DART 라벨 오류 — 사람이 본다."""
        (currency, note), _ = self._decide(self.JPY, ({"_currencies": {"KRW"}}, False))
        self.assertIsNone(currency)
        self.assertIn("KRW", note)

    def test_prev_no_data_with_no_rows_passes(self):
        """첫 정기보고서 · 적재 이력 0행 — NULL 대상이 없어 등록만 한다."""
        (currency, _), _ = self._decide(self.JPY, (None, True), n_rows=0)
        self.assertEqual(currency, "JPY")

    def test_prev_no_data_with_rows_declined(self):
        (currency, note), _ = self._decide(self.JPY, (None, True), n_rows=20)
        self.assertIsNone(currency)
        self.assertIn("20행", note)

    def test_prev_fetch_failure_declined(self):
        """요청 예외·다른 status 는 비공시 근거가 아니다 — 적재 이력이 없어도 거절."""
        (currency, _), _ = self._decide(self.JPY, (None, False), n_rows=0)
        self.assertIsNone(currency)


class _FakeCursor:
    """UPDATE 문별 rowcount 를 흉내 낸다 — isolate_non_krw 의 rowcount 대조 분기용."""

    def __init__(self, rows, fs_rowcount=None, stocks_rowcount=1):
        self.rows = rows
        self.fs_rowcount = len(rows) if fs_rowcount is None else fs_rowcount
        self.stocks_rowcount = stocks_rowcount
        self.rowcount = 0
        self.sql: list[str] = []

    def execute(self, sql, params=None):
        self.sql.append(sql)
        if sql.startswith("UPDATE financial_statements"):
            self.rowcount = self.fs_rowcount
        elif sql.startswith("UPDATE stocks"):
            self.rowcount = self.stocks_rowcount

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return (len(self.rows),)


ROWS = [
    (1, 2025, 4, "annual", 100, 10, 5, 500, 300, 1.0, 3.0),
    (2, 2026, 1, "quarter", 20, 2, 1, 510, 305, 0.2, 3.05),
]


class IsolateNonKrwTests(unittest.TestCase):
    def test_success_commits_and_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = _state(tmp)
            conn, cursor = MagicMock(), _FakeCursor(ROWS)
            ok, note = isolate_non_krw(conn, cursor, "950170", "JPY", state, "-- header\n")
            self.assertTrue(ok, note)
            self.assertEqual(note, "rows=2")
            conn.commit.assert_called_once()
            conn.rollback.assert_not_called()
            self.assertTrue(cursor.sql[0].startswith("SELECT"))
            self.assertIn("FOR UPDATE", cursor.sql[0])
            with open(os.path.join(tmp, "950170_before.json"), encoding="utf-8") as f:
                before = json.load(f)
            self.assertEqual([r["id"] for r in before], [1, 2])
            self.assertEqual(before[0]["revenue"], 100)
            with open(os.path.join(tmp, "isolate_950170.sql"), encoding="utf-8") as f:
                sql = f.read()
            self.assertTrue(sql.startswith("-- header\n"))
            self.assertIn("reporting_currency = 'JPY'", sql)
            self.assertIn("예상 UPDATE 카운트: 2", sql)

    def test_statement_rowcount_mismatch_rolls_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn, cursor = MagicMock(), _FakeCursor(ROWS, fs_rowcount=1)
            ok, note = isolate_non_krw(conn, cursor, "950170", "JPY", _state(tmp), "")
            self.assertFalse(ok)
            self.assertIn("1 ≠ 2", note)
            conn.rollback.assert_called_once()
            conn.commit.assert_not_called()
            self.assertFalse(os.path.exists(os.path.join(tmp, "isolate_950170.sql")))

    def test_stocks_rowcount_mismatch_rolls_back(self):
        """reporting_currency 가 이미 KRW 가 아니면(동시 수정 등) 손대지 않는다."""
        with tempfile.TemporaryDirectory() as tmp:
            conn, cursor = MagicMock(), _FakeCursor(ROWS, stocks_rowcount=0)
            ok, note = isolate_non_krw(conn, cursor, "950170", "JPY", _state(tmp), "")
            self.assertFalse(ok)
            conn.rollback.assert_called_once()
            conn.commit.assert_not_called()

    def test_db_exception_rolls_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn, cursor = MagicMock(), MagicMock()
            cursor.execute.side_effect = RuntimeError("boom")
            ok, note = isolate_non_krw(conn, cursor, "950170", "JPY", _state(tmp), "")
            self.assertFalse(ok)
            self.assertIn("boom", note)
            conn.rollback.assert_called_once()


class TryIsolateNonKrwTests(unittest.TestCase):
    JPY = {"_non_krw_currency": "JPY", "_currencies": {"JPY"}, "_rcept_no": "R1"}

    def test_applied_registers_ticker_and_consumes_budget(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(fetch_financials, "fetch_financial",
                             return_value=({"_currencies": {"JPY"}}, False)):
            state, known = _state(tmp), {}
            conn, cursor = MagicMock(), _FakeCursor(ROWS)
            applied = try_isolate_non_krw(
                conn, cursor, "950170", "corp", "2026", "11012", self.JPY, known, state
            )
        self.assertTrue(applied)
        self.assertEqual(known, {"950170": "JPY"})
        self.assertEqual(state.remaining, MAX_NON_KRW_ISOLATIONS_PER_RUN - 1)
        self.assertEqual(state.entries[0]["status"], "isolated")
        self.assertEqual(state.entries[0]["currency"], "JPY")

    def test_declined_rolls_back_gate_select_and_records_reason(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(fetch_financials, "fetch_financial",
                             return_value=({"_currencies": {"KRW"}}, False)):
            state, known = _state(tmp), {}
            conn, cursor = MagicMock(), _FakeCursor(ROWS)
            applied = try_isolate_non_krw(
                conn, cursor, "950170", "corp", "2026", "11012", self.JPY, known, state
            )
        self.assertFalse(applied)
        self.assertEqual(known, {})
        self.assertEqual(state.remaining, MAX_NON_KRW_ISOLATIONS_PER_RUN)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        self.assertEqual(state.entries[0]["status"], "declined")
        self.assertIn("KRW", state.entries[0]["note"])

    def test_summary_written_only_when_attempted(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = _state(os.path.join(tmp, "run"))
            state.dump_summary()
            self.assertFalse(os.path.exists(state.out_dir))
            state.entries.append({"ticker": "950170", "status": "declined"})
            state.dump_summary()
            with open(os.path.join(state.out_dir, "summary.json"), encoding="utf-8") as f:
                self.assertEqual(json.load(f)["events"][0]["ticker"], "950170")


class MainCorpsLookupExitTests(unittest.TestCase):
    """main() 의 종목 목록 조회 실패 exit 판정."""

    @staticmethod
    def _main(periods: int, corps_side_effect) -> int | None:
        with patch.object(sys, "argv", ["fetch_financials.py", "--periods", str(periods)]), \
                patch.multiple(
                    fetch_financials,
                    setup_logging=DEFAULT,
                    get_connection=DEFAULT,
                    get_existing_keys=MagicMock(return_value=set()),
                    get_non_krw_tickers=MagicMock(return_value={}),
                    get_all_corps=MagicMock(side_effect=corps_side_effect),
                    restore_filers=MagicMock(return_value=0),
                    sync_bps=MagicMock(return_value=0),
                    check_unit_suspects=DEFAULT,
                ):
            try:
                fetch_financials.main()
            except SystemExit as e:
                return e.code
        return None

    def test_lookup_failure_exits_1(self):
        self.assertEqual(self._main(1, RuntimeError("db")), 1)

    def test_lookup_failure_in_one_period_exits_0(self):
        self.assertIsNone(self._main(2, [RuntimeError("db"), []]))

    def test_zero_corps_exits_0(self):
        self.assertIsNone(self._main(1, [[]]))


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
