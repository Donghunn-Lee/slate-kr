"""fetch_stocks.py 유닛 테스트 (DART corpCode · 기업개황 → stocks).

커버 대상:
  - fetch_corp_codes: CORPCODE.xml 에서 stock_code 있는 항목만 ticker → corp_code
  - fetch_company · fetch_companies: status ≠ 000 · 요청 예외 · 상장사 stock_name 없음은 그 종목만 실패
  - assemble: corp_cls Y/K/N/E 분류 · 스팩 제외 · name = stock_name
  - is_spac: 실측 스팩 이름 전부 True · 비스팩 실측 이름 20개 전부 False
  - plan_sync: 신규 · 재활성 · 이름/market/corp_code 변경 · 이탈 판정에서 조회 실패 종목 제외
  - main 가드: corpCode 하한 · 조립 하한 · 기업개황 실패 상한 · 비활성 상한(--max-deactivate) · dry-run
"""

from __future__ import annotations

import io
import os
import sys
import unittest
import zipfile
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_dividends  # noqa: E402
import fetch_stocks  # noqa: E402
from fetch_stocks import (  # noqa: E402
    MAX_COMPANY_FAILURES,
    MAX_DEACTIVATE,
    MIN_COLLECTED,
    MIN_CORP_CODES,
    assemble,
    deactivation_block,
    fetch_companies,
    fetch_company,
    fetch_corp_codes,
    is_spac,
    main,
    plan_sync,
)

# probe 실측(2026-11-06): 활성 stocks 스팩 70 · corpCode 에만 있는 스팩 183 의 이름 전부.
# 활성 4종목은 stocks.name 과 corpCode corp_name 이 달라 둘 다 넣었다.
MEASURED_SPAC_NAMES = """
디비금융제14호스팩 KB제32호스팩 교보18호스팩 엘에스스팩1호 하나35호스팩 삼성스팩10호 엔에이치스팩32호 비엔케이제3호스팩 삼성스팩11호 KB제33호스팩
메리츠제1호스팩 신영스팩11호 미래에셋비전스팩8호 삼성스팩12호 미래에셋비전스팩9호 미래에셋비전스팩10호 교보19호기업인수목적 미래에셋비전스팩11호
IBKS제25호스팩 하나36호스팩 유진스팩12호 삼성스팩13호 한화플러스제6호스팩 신한제18호스팩 신한제17호스팩 엔에이치스팩33호 키움히어로제2호스팩 교보20호스팩
대신밸런스제20호스팩 한국제16호스팩 메리츠제2호스팩 엔에이치스팩34호 한국제17호스팩 에스케이증권제14호기업인수목적 케이비제34호스팩 키움히어로제1호스팩
유진스팩10호 IBKS제24호스팩 SK증권제12호스팩 SK증권제13호스팩 유안타제16호스팩 신한제12호스팩 신한제13호스팩 하나32호스팩 하나33호스팩
에이치엠씨제7호스팩 미래에셋비전스팩4호 미래에셋비전스팩5호 디비금융스팩12호 이베스트스팩6호 KB제29호스팩 미래에셋비전스팩6호 한국제15호스팩 엔에이치스팩31호
교보16호스팩 미래에셋비전스팩7호 대신밸런스제19호기업인수목적 하나34호스팩 KB제30호스팩 신한제14호스팩 키움제10호스팩 신한제15호스팩 유진스팩11호
교보17호스팩 키움제11호스팩 디비금융제13호스팩 KB제31호스팩 유안타제17호스팩 신한제16호스팩 한화플러스제5호스팩 교보19호스팩 KB제34호스팩
하나32호기업인수목적 대신밸런스제19호스팩 아이엠스팩1호 대우증권그린코리아기업인수목적회사 미래에셋제1호기업인수목적 동양밸류오션기업인수목적 우리기업인수목적1호
히든챔피언제1호기업인수목적 한국투자신성장1호기업인수목적회사 부국퓨쳐스타즈기업인수목적 대신증권그로쓰알파기업인수목적 에스비아이앤솔로몬드림기업인수목적
한화에스브이명장제1호기업인수목적 아이비케이에스스마트에스엠이기업인수목적1호 동부티에스블랙펄기업인수목적 대우기업인수목적2호 케이티비기업인수목적1호
현대에이블기업인수목적1호 골든브릿지제2호기업인수목적 엔에이치에스엘기업인수목적 에스케이제1호기업인수목적 하나머스트3호기업인수목적 대우기업인수목적3호
미래에셋제3호기업인수목적 엔에이치기업인수목적7호 키움제3호기업인수목적 골든브릿지제3호기업인수목적 한화에이스기업인수목적2호 유안타제2호기업인수목적 유진기업인수목적3호
케이비드림투게더제3호기업인수목적 케이비제8호기업인수목적 교보5호기업인수목적 이베스트기업인수목적3호 키움제4호기업인수목적 동부제4호기업인수목적 케이비제9호기업인수목적
에스케이제3호기업인수목적 하이에이아이1호기업인수목적 한국제4호기업인수목적 신한제3호기업인수목적 대신밸런스제4호기업인수목적 한화에이스기업인수목적3호
미래에셋대우기업인수목적1호 한화수성기업인수목적 한국제5호기업인수목적 아이비케이에스제7호기업인수목적 신한제4호기업인수목적 한화에이스기업인수목적4호 한국제6호기업인수목적
한국제7호기업인수목적 에스케이에이씨피씨제4호기업인수목적 하나머스트제6호기업인수목적 엔에이치기업인수목적13호 키움제5호기업인수목적 유안타제4호기업인수목적
케이비제17호기업인수목적 한화에스비아이기업인수목적 이베스트이안기업인수목적1호 케이비제18호기업인수목적 상상인이안제2호기업인수목적 케이비제19호기업인수목적
하나금융14호기업인수목적 에스케이제5호기업인수목적 하이제5호기업인수목적 에스케이제6호기업인수목적 하나금융15호기업인수목적 케이비제20호기업인수목적
하나금융16호기업인수목적 신영해피투모로우제6호기업인수목적 케이프이에스제4호기업인수목적 이베스트기업인수목적5호 아이비케이에스제13호기업인수목적
에이치엠씨아이비제5호기업인수목적 에이치엠씨아이비제4호기업인수목적 미래에셋대우기업인수목적5호 신한제7호기업인수목적 디비금융제8호기업인수목적 디비금융제9호기업인수목적
유안타제7호기업인수목적 유안타제8호기업인수목적 하나머스트7호기업인수목적 유진기업인수목적6호 하이제6호기업인수목적 삼성기업인수목적4호 삼성머스트기업인수목적5호
엔에이치기업인수목적19호 한화플러스제2호기업인수목적 대신밸런스제10호기업인수목적 하나금융19호기업인수목적 유진기업인수목적7호 엔에이치기업인수목적20호
신한제8호기업인수목적 엔에이치기업인수목적22호 대신밸런스제11호기업인수목적 교보11호기업인수목적 하나금융20호기업인수목적 하이제7호기업인수목적
디비금융제10호기업인수목적 아이비케이에스제17호기업인수목적 신한제9호기업인수목적 하나금융21호기업인수목적 한국제10호기업인수목적 미래에셋비전기업인수목적1호
키움제6호기업인수목적 상상인제3호기업인수목적 하나금융22호기업인수목적 신한제10호기업인수목적 신영해피투모로우제7호기업인수목적 교보12호기업인수목적
엔에이치기업인수목적23호 케이비제21호기업인수목적 삼성기업인수목적6호 아이비케이에스제19호기업인수목적 대신밸런스제12호기업인수목적 하나금융23호기업인수목적
신영해피투모로우제8호기업인수목적 하나금융24호기업인수목적 한화플러스제3호기업인수목적 유안타제9호기업인수목적 키움제7호기업인수목적 유안타제10호기업인수목적
하나금융25호기업인수목적 에스케이증권제8호기업인수목적 케이비제22호기업인수목적 한국제11호기업인수목적 엔에이치기업인수목적24호 대신밸런스제13호기업인수목적
엔에이치기업인수목적25호 삼성기업인수목적7호 엔에이치기업인수목적26호 아이비케이에스제20호기업인수목적 케이비제23호기업인수목적 교보13호기업인수목적
엔에이치기업인수목적27호 유진기업인수목적9호 대신밸런스제14호기업인수목적 아이비케이에스제21호기업인수목적 미래에셋드림기업인수목적1호 유안타제11호기업인수목적
비엔케이제1호기업인수목적 신영해피투모로우제9호기업인수목적 유안타제12호기업인수목적 미래에셋비전기업인수목적2호 하나26호기업인수목적 하나27호기업인수목적
삼성기업인수목적8호 아이비케이에스제22호기업인수목적 미래에셋비전기업인수목적3호 유안타제13호기업인수목적 하이제8호기업인수목적 엔에이치기업인수목적28호
유안타제14호기업인수목적 엔에이치기업인수목적29호 상상인제4호기업인수목적 신한제11호기업인수목적 하나29호기업인수목적 하나28호기업인수목적 케이비제25호기업인수목적
한화플러스제4호기업인수목적 에스케이증권제9호기업인수목적 디비금융제11호기업인수목적 교보14호기업인수목적 대신밸런스제15호기업인수목적 대신밸런스제16호기업인수목적
에스케이증권제10호기업인수목적 케이비제26호기업인수목적 한국제12호기업인수목적 에이치엠씨아이비제6호기업인수목적 한국제13호기업인수목적 케이비제27호기업인수목적
교보15호기업인수목적 엔에이치기업인수목적30호 아이비케이에스제23호기업인수목적 삼성기업인수목적9호 하나30호기업인수목적 하나31호기업인수목적
대신밸런스제17호기업인수목적 신영해피투모로우제10호기업인수목적 에스케이증권제11호기업인수목적 유안타제15호기업인수목적 비엔케이제2호기업인수목적
케이비제28호기업인수목적 한국제14호기업인수목적 대신밸런스제18호기업인수목적
""".split()

# 비스팩 실측 이름 — '스팩'이 들어간 아스팩오일, 스팩 이름 앞머리와 같은 증권사 · 금융지주,
# 회차(N호)가 붙은 선박펀드 · 리츠.
NON_SPAC_NAMES = [
    "아스팩오일",
    "삼성전자",
    "SK하이닉스",
    "JYP Ent.",
    "교보증권",
    "하나금융지주",
    "신한지주",
    "KB금융",
    "미래에셋증권",
    "삼성증권",
    "키움증권",
    "SK증권",
    "유안타증권",
    "대신증권",
    "한화투자증권",
    "대신밸류리츠",
    "바다로19호선박투자회사",
    "유레스메리츠제1호",
    "코크렙제15호기업구조조정부동산투자회사",
    "케이알제2호개발전문위탁관리부동산투자회사",
]


def _corpcode_zip(items: list[tuple[str, str]]) -> bytes:
    """(corp_code, stock_code) 목록 → corpCode.xml 응답 본문(zip)."""
    rows = "".join(
        f"<list><corp_code>{cc}</corp_code><corp_name>x</corp_name>"
        f"<stock_code>{sc}</stock_code><modify_date>20261101</modify_date></list>"
        for cc, sc in items
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("CORPCODE.xml", f"<result>{rows}</result>")
    return buf.getvalue()


def _resp(body: dict) -> MagicMock:
    r = MagicMock()
    r.json.return_value = body
    return r


class FetchCorpCodesTests(unittest.TestCase):
    def test_only_items_with_stock_code(self):
        res = MagicMock()
        res.content = _corpcode_zip(
            [("00126380", "005930"), ("00434003", " "), ("00164779", "000660")]
        )
        with patch("fetch_stocks.requests.get", return_value=res):
            self.assertEqual(
                fetch_corp_codes(), {"005930": "00126380", "000660": "00164779"}
            )

    def test_dividends_imports_moved_function(self):
        self.assertIs(fetch_dividends.fetch_corp_codes, fetch_stocks.fetch_corp_codes)


class FetchCompanyTests(unittest.TestCase):
    def _call(self, body: dict) -> dict:
        with patch("fetch_stocks.requests.get", return_value=_resp(body)):
            return fetch_company("00126380")

    def test_success_returns_body(self):
        body = {"status": "000", "corp_cls": "Y", "stock_name": "삼성전자"}
        self.assertEqual(self._call(body), body)

    def test_non_000_status_raises(self):
        with self.assertRaises(RuntimeError):
            self._call({"status": "013", "message": "조회된 데이타가 없습니다."})

    def test_listed_without_stock_name_raises(self):
        with self.assertRaises(RuntimeError):
            self._call({"status": "000", "corp_cls": "K", "stock_name": " "})

    def test_unlisted_without_stock_name_is_ok(self):
        body = {"status": "000", "corp_cls": "E", "stock_name": ""}
        self.assertEqual(self._call(body), body)

    def test_failure_skips_only_that_ticker(self):
        def company(corp_code):
            if corp_code == "c2":
                raise ConnectionError("boom")
            return {"corp_cls": "Y", "stock_name": corp_code}

        with patch("fetch_stocks.fetch_company", side_effect=company), \
                patch("fetch_stocks.time.sleep"):
            companies, failures = fetch_companies({"A": "c1", "B": "c2", "C": "c3"})
        self.assertEqual(sorted(companies), ["A", "C"])
        self.assertEqual(failures, {"B": "boom"})


class AssembleTests(unittest.TestCase):
    def test_classifies_by_corp_cls_and_drops_spacs(self):
        corp_codes = {
            "005930": "c1", "058470": "c2", "0099X0": "c3", "288490": "c4", "000360": "c5",
            "999990": "c6",  # 기업개황 실패 — companies 에 없다
        }
        companies = {
            "005930": {"corp_cls": "Y", "stock_name": "삼성전자 "},
            "058470": {"corp_cls": "K", "stock_name": "리노공업"},
            "0099X0": {"corp_cls": "K", "stock_name": "IBKS제25호스팩"},
            "288490": {"corp_cls": "N", "stock_name": "나라소프트"},
            "000360": {"corp_cls": "E", "stock_name": "삼환기업"},
        }
        collected, excluded = assemble(corp_codes, companies)
        self.assertEqual(
            collected,
            [
                {"ticker": "005930", "corp_code": "c1", "name": "삼성전자", "market": "KOSPI"},
                {"ticker": "058470", "corp_code": "c2", "name": "리노공업", "market": "KOSDAQ"},
            ],
        )
        self.assertEqual(
            excluded,
            {
                "000360": ("삼환기업", "corp_cls=E"),
                "0099X0": ("IBKS제25호스팩", "스팩"),
                "288490": ("나라소프트", "corp_cls=N"),
            },
        )


class SpacRuleTests(unittest.TestCase):
    def test_measured_list_is_complete(self):
        self.assertEqual(len(MEASURED_SPAC_NAMES), 257)
        self.assertEqual(len(NON_SPAC_NAMES), 20)

    def test_every_measured_spac_name_matches(self):
        for name in MEASURED_SPAC_NAMES:
            with self.subTest(name=name):
                self.assertTrue(is_spac(name))

    def test_no_non_spac_name_matches(self):
        for name in NON_SPAC_NAMES:
            with self.subTest(name=name):
                self.assertFalse(is_spac(name))


def _stock(ticker: str, name: str, market: str = "KOSPI") -> dict:
    return {"ticker": ticker, "corp_code": f"c{ticker}", "name": name, "market": market}


class PlanSyncTests(unittest.TestCase):
    def setUp(self):
        current = {
            "A": ("에이", "KOSPI", "cA", True),  # 변경 없음
            "B": ("비전", "KOSDAQ", None, True),  # 이름 변경 + corp_code 채움
            "C": ("씨", "KOSDAQ", "cC", True),  # 이전상장
            "D": ("디", "KOSPI", "cD", False),  # 재상장
            "E": ("이", "KOSDAQ", "cE", True),  # 상폐 (corp_cls=E)
            "F": ("에프", "KOSPI", "cF", True),  # 기업개황 조회 실패
            "G": ("지", "KOSPI", "cG", True),  # corpCode 에서 빠짐
            "S": ("어떤스팩1호", "KOSDAQ", "cS", True),  # 스팩
            "X": ("엑스", "KOSPI", "cX", False),  # 이미 비활성
        }
        collected = [
            _stock("A", "에이"),
            _stock("B", "비전홀딩스", "KOSDAQ"),
            _stock("C", "씨"),
            _stock("D", "디"),
            _stock("N", "새종목", "KOSDAQ"),
        ]
        excluded = {"E": ("이", "corp_cls=E"), "S": ("어떤스팩1호", "스팩")}
        self.plan = plan_sync(collected, excluded, {"F"}, current)

    def test_inserts_and_reactivations(self):
        self.assertEqual([s["ticker"] for s in self.plan.inserts], ["N"])
        self.assertEqual([s["ticker"] for s in self.plan.reactivates], ["D"])

    def test_field_changes(self):
        self.assertEqual(self.plan.renames, [("B", "비전", "비전홀딩스")])
        self.assertEqual(self.plan.market_changes, [("C", "KOSDAQ", "KOSPI")])
        self.assertEqual(self.plan.corp_code_changes, [("B", None, "cB")])

    def test_deactivates_active_leavers_with_reason(self):
        self.assertEqual(
            self.plan.deactivates,
            [("E", "이", "corp_cls=E"), ("G", "지", "corpCode 없음"), ("S", "어떤스팩1호", "스팩")],
        )

    def test_lookup_failure_is_not_a_leaver(self):
        self.assertNotIn("F", [t for t, _, _ in self.plan.deactivates])


class DeactivationBlockTests(unittest.TestCase):
    def test_within_caps_passes(self):
        self.assertIsNone(deactivation_block(MAX_DEACTIVATE, MAX_COMPANY_FAILURES, MAX_DEACTIVATE))

    def test_too_many_lookup_failures_blocks(self):
        self.assertIsNotNone(deactivation_block(0, MAX_COMPANY_FAILURES + 1, MAX_DEACTIVATE))

    def test_too_many_leavers_blocks_unless_cap_raised(self):
        self.assertIsNotNone(deactivation_block(MAX_DEACTIVATE + 1, 0, MAX_DEACTIVATE))
        self.assertIsNone(deactivation_block(MAX_DEACTIVATE + 1, 0, MAX_DEACTIVATE + 1))


def _corp_codes(n: int) -> dict[str, str]:
    return {f"{i:05d}0": f"c{i}" for i in range(n)}


def _companies(tickers) -> dict[str, dict]:
    return {t: {"corp_cls": "Y", "stock_name": f"종목{t}"} for t in tickers}


class MainGuardTests(unittest.TestCase):
    ENV = {"DART_API_KEY": "k", "DATABASE_URL": "postgres://x"}

    def setUp(self):
        self.corp_codes = _corp_codes(MIN_CORP_CODES)
        self.companies = _companies(list(self.corp_codes)[:MIN_COLLECTED])

    def _main(self, argv=(), corp_codes=None, companies=None, failures=None, current=None):
        conn = MagicMock()
        with patch.dict(os.environ, self.ENV), \
                patch.object(sys, "argv", ["fetch_stocks.py", *argv]), \
                patch("fetch_stocks.setup_logging"), \
                patch("fetch_stocks.fetch_corp_codes",
                      return_value=self.corp_codes if corp_codes is None else corp_codes), \
                patch("fetch_stocks.fetch_companies",
                      return_value=(self.companies if companies is None else companies,
                                    failures or {})) as fetch, \
                patch("fetch_stocks.get_connection", return_value=conn) as get_conn, \
                patch("fetch_stocks.load_current", return_value=current or {}), \
                patch("fetch_stocks.upsert_stocks") as upsert, \
                patch("fetch_stocks.deactivate_stocks") as deactivate, \
                self.assertLogs("fetch_stocks", level="INFO") as logs:
            try:
                main()
                code = None
            except SystemExit as e:
                code = e.code
        self.logs = "\n".join(logs.output)
        return code, fetch, get_conn, conn, upsert, deactivate

    def test_short_corpcode_exits_1_before_company_calls_and_db(self):
        code, fetch, get_conn, *_ = self._main(corp_codes=_corp_codes(MIN_CORP_CODES - 1))
        self.assertEqual(code, 1)
        fetch.assert_not_called()
        get_conn.assert_not_called()
        self.assertIn("응답 이상", self.logs)

    def test_short_collected_exits_1_without_db(self):
        companies = _companies(list(self.corp_codes)[: MIN_COLLECTED - 1])
        code, _, get_conn, *_ = self._main(companies=companies)
        self.assertEqual(code, 1)
        get_conn.assert_not_called()
        self.assertIn("기업개황 부분 실패", self.logs)

    def test_upserts_and_deactivates_in_one_commit(self):
        current = {"GONE00": ("상폐", "KOSPI", "cg", True)}
        code, _, _, conn, upsert, deactivate = self._main(current=current)
        self.assertIsNone(code)
        self.assertEqual(len(upsert.call_args.args[1]), MIN_COLLECTED)
        deactivate.assert_called_once_with(conn.cursor.return_value, ["GONE00"])
        conn.commit.assert_called_once()
        self.assertIn("[비활성] GONE00 상폐 (corpCode 없음)", self.logs)

    def test_many_lookup_failures_upsert_but_skip_deactivation(self):
        failures = {f"F{i:05d}": "boom" for i in range(MAX_COMPANY_FAILURES + 1)}
        current = {"GONE00": ("상폐", "KOSPI", "cg", True)}
        code, _, _, conn, upsert, deactivate = self._main(failures=failures, current=current)
        self.assertEqual(code, 1)
        upsert.assert_called_once()
        deactivate.assert_not_called()
        conn.commit.assert_called_once()
        self.assertIn("비활성 skip: 기업개황 실패(101)", self.logs)

    def test_too_many_leavers_skip_deactivation_unless_cap_raised(self):
        current = {f"GONE{i:02d}": ("상폐", "KOSPI", "cg", True) for i in range(MAX_DEACTIVATE + 1)}
        code, _, _, _, upsert, deactivate = self._main(current=current)
        self.assertEqual(code, 1)
        upsert.assert_called_once()
        deactivate.assert_not_called()
        self.assertIn("비활성 skip: 이탈 후보(31)", self.logs)

        code, _, _, _, _, deactivate = self._main(
            argv=["--max-deactivate", str(MAX_DEACTIVATE + 1)], current=current
        )
        self.assertIsNone(code)
        self.assertEqual(len(deactivate.call_args.args[1]), MAX_DEACTIVATE + 1)

    def test_dry_run_writes_nothing(self):
        current = {"GONE00": ("상폐", "KOSPI", "cg", True)}
        code, _, _, conn, upsert, deactivate = self._main(argv=["--dry-run"], current=current)
        self.assertIsNone(code)
        upsert.assert_not_called()
        deactivate.assert_not_called()
        conn.commit.assert_not_called()
        self.assertIn("[비활성] GONE00", self.logs)


if __name__ == "__main__":
    unittest.main()
