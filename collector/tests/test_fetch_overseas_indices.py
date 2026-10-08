"""fetch_overseas_indices.py exit code 유닛 테스트.

커버 대상:
  - main: 8종 전부 예외·upsert 실패면 exit 1 / 일부 예외·신규 봉 없음은 exit 0 (daily · backfill)
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import DEFAULT, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_overseas_indices  # noqa: E402
from fetch_overseas_indices import KST, OVERSEAS_CODES, main  # noqa: E402

TODAY_KST = datetime.now(KST).date()
LATEST = (
    TODAY_KST - timedelta(days=5),
    Decimal("100"),
    (Decimal("99"), Decimal("101"), Decimal("98"), Decimal("100")),
)
# latest 와 today 사이 확정 봉 — OHLC 가 latest 와 달라 carry drop 되지 않는다.
NEW_BAR = {
    (TODAY_KST - timedelta(days=2)).isoformat(): (
        Decimal("100"), Decimal("103"), Decimal("99"), Decimal("102"), 0,
    ),
}


def _main(argv=(), **mocks) -> int | None:
    with patch.dict(os.environ, {"DATABASE_URL": "postgres://x"}), \
            patch.object(sys, "argv", ["fetch_overseas_indices.py", *argv]), \
            patch.object(fetch_overseas_indices, "KIS_APP_KEY", "k"), \
            patch.object(fetch_overseas_indices, "KIS_APP_SECRET", "s"), \
            patch.multiple(
                fetch_overseas_indices,
                setup_logging=DEFAULT,
                get_connection=DEFAULT,
                get_token=DEFAULT,
                **mocks,
            ):
        try:
            main()
        except SystemExit as e:
            return e.code
    return None


class MainExitTests(unittest.TestCase):
    def test_every_code_raising_exits_1(self):
        code = _main(get_latest_stored=MagicMock(side_effect=RuntimeError("db")))
        self.assertEqual(code, 1)

    def test_every_upsert_failing_exits_1(self):
        code = _main(
            get_latest_stored=MagicMock(return_value=LATEST),
            fetch_range=MagicMock(return_value=NEW_BAR),
            upsert_bars=MagicMock(return_value=(0, 1)),
        )
        self.assertEqual(code, 1)

    def test_one_code_raising_exits_0(self):
        code = _main(
            get_latest_stored=MagicMock(
                side_effect=[RuntimeError("db")] + [LATEST] * (len(OVERSEAS_CODES) - 1)
            ),
            fetch_range=MagicMock(return_value=NEW_BAR),
            upsert_bars=MagicMock(return_value=(1, 0)),
        )
        self.assertIsNone(code)

    def test_no_new_bars_exits_0(self):
        code = _main(
            get_latest_stored=MagicMock(return_value=LATEST),
            fetch_range=MagicMock(return_value={}),
            upsert_bars=MagicMock(),
        )
        self.assertIsNone(code)

    def test_backfill_every_code_raising_exits_1(self):
        code = _main(["--backfill"], fetch_range=MagicMock(side_effect=RuntimeError("kis")))
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
