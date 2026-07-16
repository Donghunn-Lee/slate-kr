import { DisclosureType } from "./classifyDisclosure";

// 픽스처 소스: web/tmp/d6/raw.json (D6 probe dump). tmp/는 .gitignore 대상이므로
// 필요한 데이터를 여기 baked-in 한다. 라벨(expected)은 classifyDisclosure.ts의
// 분기 로직에서 엄밀히 도출한 값이며, 각 라인 코멘트에 근거를 남긴다.

export type CuratedCase = {
  report_nm: string;
  flr_nm: string;
  expected: DisclosureType | null;
};

// classifyDisclosure의 모든 분기 경로 커버. 소스 근거는 라인별 코멘트 참조.
export const CURATED_CASES: CuratedCase[] = [
  { report_nm: "소속부변경              ", flr_nm: "코스닥시장본부", expected: null }, // PROCEDURAL #1 소속부변경 매칭 (거래소 발신)
  { report_nm: "권리락              (유상증자)", flr_nm: "코스닥시장본부", expected: null }, // PROCEDURAL #2 권리락 매칭 (거래소 발신)
  { report_nm: "불성실공시법인지정              ", flr_nm: "유가증권시장본부", expected: DisclosureType.MARKET_ACTION }, // exchange filer + PROCEDURAL 14개 모두 무매칭
  { report_nm: "주권매매거래정지기간변경              (개선기간 부여)", flr_nm: "코스닥시장본부", expected: DisclosureType.MARKET_ACTION }, // exchange filer + PROCEDURAL 14개 모두 무매칭 (실제 raw.json 관측)
  { report_nm: "주요사항보고서(유상증자결정)", flr_nm: "삼성전자", expected: DisclosureType.MAJOR_EVENT }, // PATTERNS[0].keywords[0] 주요사항보고서 매칭
  { report_nm: "분기보고서 (2026.03)", flr_nm: "삼성전자", expected: DisclosureType.FINANCIAL }, // PATTERNS[1].keywords[1] 분기보고서 매칭 (앞선 MAJOR_EVENT 무매칭 확인)
  { report_nm: "주식등의대량보유상황보고서", flr_nm: "현대차", expected: DisclosureType.OWNERSHIP }, // PATTERNS[2].keywords[0] 대량보유상황보고 매칭 (앞선 카테고리 무매칭)
  { report_nm: "감사보고서제출", flr_nm: "SK하이닉스", expected: DisclosureType.AUDIT }, // PATTERNS[3].keywords[0] 감사보고서 매칭 (앞선 카테고리 무매칭)
  { report_nm: "정기주주총회소집공고", flr_nm: "LG전자", expected: DisclosureType.SHAREHOLDER_MEETING }, // PATTERNS[4].keywords[0] 주주총회 매칭
  { report_nm: "기업설명회(IR)개최(안내공시)", flr_nm: "카카오", expected: null }, // 회사 발신 + 5개 PATTERNS 모두 무매칭
  { report_nm: "단일판매ㆍ공급계약체결", flr_nm: "삼성전자", expected: DisclosureType.MAJOR_EVENT }, // ㆍ 포함: PATTERNS[0] MAJOR_EVENT 매칭 (회사 발신 경로)
  { report_nm: "단일판매공급계약", flr_nm: "유가증권시장본부", expected: null }, // ㆍ 미포함: PROCEDURAL #10 단일판매공급계약 매칭 (거래소 발신 경로)
];

export type ExchangeFiledSample = {
  report_nm: string;
  flr_nm: string;
};

// raw.json exchangeItems에서 isExchangeFiled(flr_nm) === true 인 항목만
// (report_nm, flr_nm) 쌍으로 dedup 한 결과 (전량, 176건).
// 라벨 없이 불변식 테스트용: "거래소 발신 → MARKET_ACTION | null,
// PATTERNS 카테고리(MAJOR_EVENT/FINANCIAL/OWNERSHIP/AUDIT/SHAREHOLDER_MEETING) 도달 불가".
export const EXCHANGE_FILED_SAMPLE: ExchangeFiledSample[] = [
  { report_nm: "기타시장안내(금일NXT경쟁매매대상종목지정으로인한KRX시간외단일가매매제외종목안내(유가증권시장))              ", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(금일NXT경쟁매매대상종목지정으로인한KRX시간외단일가매매제외종목안내(코스닥시장))              ", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (개선기간 부여)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장위원회 심의·의결 결과 및 개선기간 부여 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              ", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지              (주식의 병합, 분할 등 전자등록 변경, 말소)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(현저한시황변동)              ", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선기간 종료에 따른 상장폐지 여부 결정 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (자본감소)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (무상증자)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (단일판매공급계약)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내(관리종목지정우려종목)              (시가총액 200억원 미달)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (주권 상장폐지 우려 예고)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (상장폐지에 따른 정리매매 개시)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정 등 효력정지 가처분 신청 기각에 따른 정리매매절차 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복)", flr_nm: "코스닥시장본부" },
  { report_nm: "투자유의안내              ", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지해제              (액면분할 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (액면병합 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선기간 부여 결정)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(관리종목지정우려종목)              ", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시불이행)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (감자 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "매매거래정지및정지해제(중요내용공시)              ", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지기간변경              (상장폐지 사유 발생)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장위원회 개최 결과 등 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]불성실공시법인지정예고              (공시불이행)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (소프트센 1우선주 관리종목 지정사유 추가 우려)(시가총액 20억원 미달)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 이의신청서 제출)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (개선계획서 제출)", flr_nm: "유가증권시장본부" },
  { report_nm: "권리락              (유상증자)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (감자 및 액면병합 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]불성실공시법인지정              ", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지              (투자자 보호)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (정리매매 보류 관련)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (회생절차 개시결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장위원회 개최 결과 및 상장폐지 결정 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              ", flr_nm: "유가증권시장본부" },
  { report_nm: "조회공시요구(현저한시황변동)              ", flr_nm: "유가증권시장본부" },
  { report_nm: "배당락              ", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 개최 결과 및 심의속행 결정 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 개최 결과 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 관련 이의신청서 접수)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행내역서 제출)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복 3건)", flr_nm: "코스닥시장본부" },
  { report_nm: "소속부변경              ", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시불이행 8건)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (SPAC 합병(예비심사청구대상))", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (상장적격성 실질심사 대상 결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장 시장조성 변경계약 체결 및 시행안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인미지정              (지정유예)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행 여부 심의 요청)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(약명및영문명)              (영문상호)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 대상 결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              ", flr_nm: "유가증권시장본부" },
  { report_nm: "불성실공시법인지정              (공시번복 6건, 공시불이행 1건, 공시변경 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시불이행)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시번복)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시번복 1건, 공시변경 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "권리락              (무상증자)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선계획서 제출)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 관련 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내(관리종목지정우려종목)              (시가총액 150억원 미달)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시변경)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정 효력정지 가처분 신청 기각에 따른 정리매매절차 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 심의·의결 결과 및 개선기간 부여 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시변경)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행내역서 제출 )", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              ", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내(관리종목지정우려종목)              (소프트센 1우선주(거래량 미달))", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인미지정              (지정유예)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인미지정              (공시번복)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 속행 결정 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지해제              (감자 주권 변경상장 등)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (주식병합(무액면주식) 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]불성실공시법인지정예고              ", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(약명및영문명)              (한글약명)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선기간 종료 및 향후 절차 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 사유 추가 관련 절차 미진행)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정 등 효력정지 가처분 신청 기각결정에 따른 정리매매절차 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정등 효력정지 가처분 신청 기각에 따른 정리매매절차 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (상장폐지에 따른 정리매매 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복 1건, 공시변경 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 결과 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 심의대상 결정)", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지기간변경              (회생절차 개시신청)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 사유추가 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (조회공시 신고시한 위반)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (유가증권시장 기업심사위원회 심의결과 및 상장유지 결정 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "[기재정정]불성실공시법인지정예고              (공시번복)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              (주주총회효력정지 가처분 및 직무집행정지 가처분 결정설)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (감자 및 액면분할 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (관리종목지정우려종목)(시가총액 150억원 미달)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (최대주주의 의무보유 이행 관련)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (실질심사 대상여부 결정을 위한 조사기간 연장 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              (대표 등 주요 경영진 횡령·배임 피소설)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (투자자보호)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 심의·의결 결과 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시번복 4건)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (상장폐지 사유발생)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복 6건, 공시불이행 1건, 공시변경 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 대상 결정 )", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (회생절차 개시결정 관련 시장안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (상장폐지사유 발생)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장위원회 심의·의결 결과 등 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선기간 종료에 따른 상장폐지 여부 결정 안내 )", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 개최기한 연장안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (소프트센 1우선주 관리종목지정 우려예고)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정 효력정지 가처분 신청 기각결정에 따른 정리매매절차 재개)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              ", flr_nm: "유가증권시장본부" },
  { report_nm: "불성실공시(의결권공시)              ", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지기간변경              (감자 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (합병결정 철회)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (액면병합 주권 변경상장)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시불이행 2건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (앱토크롬 6WR 신주인수권 행사기간 만료 및 상장폐지 예고)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선기간 부여)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(최대주주의의무보유관련)              (최대주주의 의무보유 이행 관련)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지결정 효력정지 등 가처분 신청 기각에 따른 정리매매절차 재개)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장·공시위원회 결과)", flr_nm: "유가증권시장본부" },
  { report_nm: "불성실공시법인미지정              (공시불이행)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (최대주주의 의무보유 대상 확인 관련)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 절차 관련 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (투자자 보호)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              ((주)디에이치오토넥스 상장적격성 실질심사 결과 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "주권매매거래정지기간변경              (주식의 병합, 분할 등 전자등록 변경, 말소)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (우회상장 미해당)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (우회상장여부 및 요건충족확인)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 대상결정 기한 안내 )", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (분기보고서 미제출 관련 상장폐지 절차 미진행)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (관리종목 지정사유 추가 관련 시장조치사항 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시불이행 1건, 공시번복 2건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 대상결정 기한 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (중요한 영업정지)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 관련)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (상장적격성 실질심사 대상(사유발생))", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (유가증권시장 상장공시위원회 심의결과 및 상장유지 결정 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "불성실공시법인지정              (공시번복 1건, 공시불이행 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복 4건)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지              (SPAC 소멸합병)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (회생절차 개시신청 관련 시장안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 관련 이의신청서 접수 및 개선기간 부여)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행내역서 제출에 따른 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              (계열회사 합병 추진설)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              (자회사 합병 추진설)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지기간변경              (파산신청)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (코스닥시장위원회 심의·의결결과 등 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              ((주)버킷스튜디오 개선계획 이행내역서 제출)", flr_nm: "코스닥시장본부" },
  { report_nm: "조회공시요구(풍문또는보도)              (타법인 인수설)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 사유 추가 발생)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (회계처리기준 위반행위 관련 상장적격성 실질심사 절차 미진행 안내)", flr_nm: "유가증권시장본부" },
  { report_nm: "불성실공시법인지정              (공시불이행 1건, 공시변경 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내(약명및영문명)              ", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]주권매매거래정지              ", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (상장유지 결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "주권매매거래정지해제              (상장적격성 실질심사 대상 제외 결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (기업심사위원회 심의·의결 결과 및 상장유지 결정 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장적격성 실질심사 대상 제외 결정)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]기타시장안내              (DH오토리드 9WR 신주인수권 행사기간 만료 및 상장폐지 예고)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (회생절차 폐지결정 관련 시장조치 미진행)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]기타시장안내              (상장폐지 관련 이의신청서 접수)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]기타시장안내              (개선기간 종료에 따른 상장폐지 여부 결정 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (추가상장 유예 관련 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행여부 심의요청서 및 상장폐지 이의신청서 제출)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (개선계획 이행여부 심의요청서 접수)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내(최대주주의의무보유관련)              ", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시불이행 1건, 공시번복 2건)", flr_nm: "코스닥시장본부" },
  { report_nm: "[기재정정]기타시장안내(약명및영문명)              (영문상호)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내(약명및영문명)              (영문상호 및 영문약명)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정              (공시불이행 2건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 관련 이의신청서 접수, 개선기간 부여 및 관련 상장폐지 절차 미진행 )", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장폐지 관련 안내)", flr_nm: "코스닥시장본부" },
  { report_nm: "불성실공시법인지정예고              (공시번복 1건, 공시불이행 1건)", flr_nm: "코스닥시장본부" },
  { report_nm: "기타시장안내              (상장공시위원회 개최기한 연장)", flr_nm: "유가증권시장본부" },
  { report_nm: "기타시장안내              (개선기간 종료)", flr_nm: "유가증권시장본부" },
  { report_nm: "[기재정정]기타시장안내              (유니슨 15WR 신주인수권 행사기간 만료 및 상장폐지 예고)", flr_nm: "코스닥시장본부" },
];

export type MisclassifiedSeed = {
  report_nm: string;
  classified: string;
};

// raw.json classifierMisclassified 시드. 분류기 수정은 별도 트랙(D backlog).
// 여기서는 it.todo 로 문서화만 하고 단언/수정은 하지 않는다.
export const MISCLASSIFIED_SEEDS: MisclassifiedSeed[] = [
  { report_nm: "조회공시요구(풍문또는보도)              (주주총회효력정지 가처분 및 직무집행정지 가처분 결정설)", classified: "SHAREHOLDER_MEETING" },
  { report_nm: "기타시장안내              (분기보고서 미제출 관련 상장폐지 절차 미진행)", classified: "FINANCIAL" },
];
