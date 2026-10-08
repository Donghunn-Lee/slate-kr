"""update_corp_codes.py 유닛 테스트.

커버 대상:
  - main: DART 매핑 0건이면 DB 커넥션 전에 exit 1
"""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from update_corp_codes import main  # noqa: E402


class MainEmptyMappingTests(unittest.TestCase):
    def _main(self, mapping):
        with patch.object(sys, "argv", ["update_corp_codes.py"]), \
                patch("update_corp_codes.setup_logging"), \
                patch("update_corp_codes.fetch_corp_codes", return_value=mapping), \
                patch("update_corp_codes.get_connection") as conn:
            conn.return_value.cursor.return_value.fetchall.return_value = []
            try:
                main()
                code = None
            except SystemExit as e:
                code = e.code
        return code, conn

    def test_empty_mapping_exits_1_without_db(self):
        code, conn = self._main({})
        self.assertEqual(code, 1)
        conn.assert_not_called()

    def test_mapping_proceeds_to_report(self):
        code, conn = self._main({"005930": "00126380"})
        self.assertIsNone(code)
        conn.assert_called_once()


if __name__ == "__main__":
    unittest.main()
