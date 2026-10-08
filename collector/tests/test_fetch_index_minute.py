"""fetch_index_minute.py exit code 유닛 테스트.

커버 대상:
  - run: 4종 전부 처리 예외면 exit 1 / 일부 예외·빈 응답·호출 실패(None)는 exit 0
"""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import DEFAULT, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_index_minute  # noqa: E402
from fetch_index_minute import INDEX_CODE_TO_ISCD, run  # noqa: E402


def _run(**mocks) -> int | None:
    with patch.multiple(
        fetch_index_minute,
        get_connection=DEFAULT,
        get_token=DEFAULT,
        prune_old=DEFAULT,
        **mocks,
    ):
        try:
            run()
        except SystemExit as e:
            return e.code
    return None


class RunExitTests(unittest.TestCase):
    def test_every_code_raising_exits_1(self):
        code = _run(
            kis_intraday_call=MagicMock(return_value=[]),
            upsert_bars=MagicMock(side_effect=RuntimeError("db")),
        )
        self.assertEqual(code, 1)

    def test_one_code_raising_exits_0(self):
        code = _run(
            kis_intraday_call=MagicMock(return_value=[]),
            upsert_bars=MagicMock(
                side_effect=[RuntimeError("db")] + [0] * (len(INDEX_CODE_TO_ISCD) - 1)
            ),
        )
        self.assertIsNone(code)

    def test_empty_responses_exit_0(self):
        code = _run(
            kis_intraday_call=MagicMock(return_value=[]),
            upsert_bars=MagicMock(return_value=0),
        )
        self.assertIsNone(code)

    # HTTP 오류·rt_cd≠0 은 kis_intraday_call 이 None 으로 흡수 — 예외 집계 밖.
    def test_call_failures_exit_0(self):
        upsert = MagicMock()
        code = _run(kis_intraday_call=MagicMock(return_value=None), upsert_bars=upsert)
        self.assertIsNone(code)
        upsert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
