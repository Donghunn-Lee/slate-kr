<div align="center">

# SlateKR

국내 상장 종목의 가격 · 재무 · 공시와 국내·해외 주요 지수를 조회하는 웹앱

**부분 실패 UI · 클라이언트 데이터 흐름 · 서버 캐시 · 런타임 검증 · 익명 동기화**

[![Web CI](https://github.com/Donghunn-Lee/slate-kr/actions/workflows/web-ci.yml/badge.svg)](https://github.com/Donghunn-Lee/slate-kr/actions/workflows/web-ci.yml) [![Collector CI](https://github.com/Donghunn-Lee/slate-kr/actions/workflows/collector-ci.yml/badge.svg)](https://github.com/Donghunn-Lee/slate-kr/actions/workflows/collector-ci.yml) ![Next.js 16](https://img.shields.io/badge/Next.js_16-24292F?style=flat&logo=nextdotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white) ![TanStack Query v5](https://img.shields.io/badge/TanStack_Query_v5-FF4154?style=flat&logo=reactquery&logoColor=white) ![Zustand](https://img.shields.io/badge/Zustand-555?style=flat) ![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat&logo=zod&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white)

[**Live**](https://slate-kr.vercel.app) &nbsp;·&nbsp; [Styleguide](https://slate-kr.vercel.app/styleguide) &nbsp;·&nbsp; 2026.04 – 2026.10 &nbsp;·&nbsp; 1인 개발

</div>

<img src="docs/images/hero.png" width="100%" alt="홈 히어로 — 헤드라인과 서비스 캐러셀">

## 한눈에 보기

<table>
  <thead>
    <tr>
      <th nowrap>설계 결정</th>
      <th>한 일</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td nowrap><a href="#1-부분-실패-ui">1. 부분 실패 UI</a></td>
      <td>종목 상세를 섹션 단위 Suspense로 스트리밍하고, 섹션마다 loading · empty · error · 부분 실패를 구분</td>
    </tr>
    <tr>
      <td nowrap><a href="#2-클라이언트-데이터-흐름">2. 클라이언트 데이터 흐름</a></td>
      <td>장 세션 중에만 폴링하고, 실패 응답이 와도 직전 정상 데이터를 유지. 차트는 React state 없이 ref와 DOM으로 그림</td>
    </tr>
    <tr>
      <td nowrap><a href="#3-서버-캐시">3. 서버 캐시</a></td>
      <td>지수 · 순위 API 응답을 서버에서 캐시해 KIS(한국투자증권 OpenAPI) 호출 수를 사용자 수와 분리. 실패 응답은 캐시에 남기지 않음</td>
    </tr>
    <tr>
      <td nowrap><a href="#4-런타임-검증-ai-공시-요약">4. 런타임 검증</a></td>
      <td>외부 API 응답 · 저장 스냅샷 · 요청 본문을 Zod로 검증. AI 요약은 스키마 하나로 응답 형식 지정과 검증을 함께 처리</td>
    </tr>
    <tr>
      <td nowrap><a href="#5-익명-동기화">5. 익명 동기화</a></td>
      <td>로그인 없이 쿠키로 브라우저를 식별해 관심종목 · 메모를 서버에 저장</td>
    </tr>
  </tbody>
</table>

## 주요 화면

<table>
  <tr>
    <td width="50%" align="center">
      <b>홈</b><br>
      국내 4 · 해외 8 지수를 장중 갱신<br>
      <img src="docs/images/home.png" width="100%" alt="홈 — 지수 그리드">
    </td>
    <td width="50%" align="center">
      <b>검색</b><br>
      300ms debounce · 요청 취소 · 키보드 탐색<br>
      <img src="docs/images/search.png" width="100%" alt="검색 드롭다운">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>종목 상세</b><br>
      가격 통계 · 차트 · 핵심 지표 · 5년 재무 · 공시<br>
      <img src="docs/images/stock-detail.png" width="100%" alt="종목 상세 — 헤더와 핵심 지표">
    </td>
    <td width="50%" align="center">
      <b>관심종목 · 메모</b><br>
      그룹 · 메모 · 로그인 없는 서버 저장<br>
      <img src="docs/images/watchlist-memo.png" width="100%" alt="관심종목과 메모">
    </td>
  </tr>
</table>

UI는 정보 단위마다 독립 패널로 나누는 "슬레이트(판)" 구조이며, 패널 색은 공시 · 가격 · 재무 · 차트 · 지표마다 하나씩 고정했습니다. 토큰과 컴포넌트를 [`/styleguide`](https://slate-kr.vercel.app/styleguide)에 먼저 등재하고, 화면은 이를 기반으로 구현했습니다. shadcn은 Dialog · Popover · Tabs처럼 상호작용을 다루는 기본 컴포넌트에만 사용하고, 카드 · 표 · 배지처럼 값을 보여주는 컴포넌트는 토큰 기준으로 직접 만들었습니다.

## 배경

SlateKR은 국내 주식과 관련된 여러 데이터를 구조화해 제공하는 조회형 웹앱입니다. 이전 프로젝트 [Aim Test](https://github.com/Donghunn-Lee/aimtest)는 실시간 상호작용이 중심이어서, 검색부터 상세 · 저장까지 이어지는 사용자 경험이나 외부 데이터를 수집해 화면에 올리는 풀스택 구성을 담을 수 없었습니다. 이번에는 이 두 가지를 보여주고자 했습니다.

소재를 증권 데이터로 고른 이유는 가격 · 재무 · 공시처럼 성격이 다른 데이터가 섞여 있어 정리하는 방식에 따라 구조가 분명하게 드러나기 때문입니다. 새로운 정보를 만들기보다 흩어진 정보를 모아 읽기 쉽게 구조화하는 데 집중했고, 투자 추천이나 분석은 제공하지 않습니다. 사용자 흐름은 검색 → 종목 상세 → 관심종목이며, 국내 · 해외 지수는 홈과 지수 화면에서 확인할 수 있습니다. AI 공시 요약은 공시를 읽는 부담을 덜어 주는 보조 기능입니다.

## 아키텍처

```
DB / 외부 API
  → lib/            조회 + 정규화 (순수 함수 · Zod 검증)
    → shared/types/ 도메인 모델
      → UI          도메인 모델만 소비
```

DB 행과 외부 API 응답은 `lib/`의 정규화 레이어 안에서만 사용하고, 바깥에는 도메인 모델로 바꿔서 넘깁니다. 외부 API 응답 · 저장 스냅샷 · 요청 본문은 Zod로 검증하고, 외부 응답이 검증에 실패하면 조회 실패로 처리합니다.

<details>
<summary>디렉토리 구조</summary>

```
web/src/
├── app/         라우트 · layout · loading / error / not-found
├── features/    검색 · 관심종목 · 메모 등 사용자 액션 단위
├── entities/    종목 · 공시 · 지표 · 지수 등 도메인 표시 단위
├── shared/      도메인 타입 · 상수 · 포맷터 · 범용 유틸
├── lib/         DB 조회 · 정규화 · 서버 유틸
└── components/ui/  shadcn 기반 primitive
collector/       Python 수집 스크립트
web/sql/         DDL · 데이터 보정 · 캐시 리셋 SQL (Neon 콘솔 수동 적용, 파일로 추적)
```

</details>

| 데이터                                     | 위치                                                | 이유                              |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------- |
| 종목 기본 정보 · 재무 · 공시 · 일봉 데이터 | Server Component(요청 시 서버 렌더)                 | 읽기 전용, 검색 노출              |
| 시세 · 분봉(종목 · 지수)                   | Client + TanStack Query                             | 장 세션별 폴링 주기, 탭 복귀 처리 |
| 관심종목 · 메모 · 최근 조회                | Zustand persist + 익명 서버 스냅샷(관심종목 · 메모) | 사용자 소유 데이터, 로그인 없음   |

page 파일은 전부 Server Component이고, `use client`는 이벤트 · 브라우저 API · 차트 · 입력 UI에만 사용합니다. 종목 상세는 페이지마다 메타 태그를 생성하고, sitemap은 활성 종목 약 2,650개를 담고 매일 새로 만들어집니다.

데이터는 Python collector가 KIS(시세 · 지수 · 분봉) · DART(재무 · 배당 · 기업 코드) · FSS(종목 목록) · KRX(상장주식수 · 상장일)에서 수집해 Neon(PostgreSQL)에 적재합니다. 실행은 cron-job.org가 정해진 시각에 GitHub Actions 워크플로우를 호출하는 방식입니다. 주기와 백필 절차는 [collector/README.md](collector/README.md)에 정리했습니다.

### Tech Stack

| 영역      | 구성                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Frontend  | Next.js 16 App Router · TypeScript strict · Tailwind CSS v4 · shadcn/ui · TanStack Query v5 · Zustand · lightweight-charts v5 · Zod |
| Infra     | Neon PostgreSQL · Vercel · GitHub Actions · cron-job.org                                                                            |
| Data      | Python collector · KIS OpenAPI · DART OpenAPI · FSS API · KRX Marketplace                                                           |
| AI · Test | Gemini API · Vitest                                                                                                                 |

## 설계 결정

### 1. 부분 실패 UI

종목 상세 한 페이지가 DB · DART · KIS 세 곳에서 데이터를 받습니다. 초기 구현은 조회에 실패하면 빈 배열을 돌려줘서, 페이지는 유지됐지만 데이터가 없는 것과 조회에 실패한 것이 구분되지 않았습니다. 여러 종목 가격을 `Promise.all`로 묶은 곳은 하나만 실패해도 전체가 500이 됐습니다.

- 섹션마다 Suspense로 나눠 따로 스트리밍하고, 실패도 그 섹션 안에서만 표시합니다. 헤더 안에서 KIS를 따로 조회하는 시장조치 배지는 한 번 더 분리해, KIS 응답을 3초 늦춘 로컬 프로덕션 빌드에서 헤더 제목 표시가 약 3.4초에서 0.3초로 빨라졌습니다.
- 섹션 상태는 loading · empty · error에 부분 실패를 더해 네 가지로 구분합니다. 부분 실패는 나머지 값은 유지하고 실패한 자리에만 배지를 붙이는 상태입니다.
  <img src="docs/images/partial-failure.png" width="100%" alt="핵심 지표 — 가격 조회 실패 시 PER · PBR · 시가배당률에만 로딩 실패 배지">
- 여러 건을 한 번에 조회할 때는 `Promise.allSettled`를 사용합니다. 그래서 지수 그리드는 실패한 셀만 종가 기준 값으로 바뀌고 나머지는 정상으로 표시됩니다.

<sub>코드 · [`stocks/[ticker]/layout.tsx`](web/src/app/stocks/%5Bticker%5D/layout.tsx) · [`StockHeader.tsx`](web/src/entities/stock/StockHeader.tsx)</sub><br>
<sub>글 · [#037 empty와 error 분리](https://velog.io/@dh82680/SlateKR-037-fallback-점검-empty와-error를-구분하기) · [#155 분봉 실패 처리](https://velog.io/@dh82680/SlateKR-155-코드로만-종결한-두-판정과-120봉-TR-전환) · [#174 헤더 스트리밍 실측](https://velog.io/@dh82680/SlateKR-174-선언만-있던-revalidate와-한-달-멈춰-있던-차트-당일-봉)</sub>

### 2. 클라이언트 데이터 흐름

시세와 분봉은 브라우저에서 TanStack Query로 폴링하고, 차트는 lightweight-charts가 React 렌더 밖에서 직접 그립니다.

- 폴링은 장 세션 중에만 실행합니다. 차트는 따로 요청하지 않고 헤더가 받아 둔 시세 캐시를 구독만 해서, 같은 종목의 폴링이 중복되지 않습니다. 다른 탭이나 창에 있다가 돌아오면 분봉을 한 번 새로 받되, 장이 끝난 뒤에는 받지 않습니다.
- Route Handler는 외부 API가 실패해도 가능한 한 HTTP 200에 `failed` 플래그를 담아 응답합니다. 클라이언트는 이 플래그가 붙은 분봉 응답으로 직전 정상 데이터를 덮어쓰지 않고, 직전 데이터가 없을 때만 실패 화면을 띄웁니다.
- 차트 컴포넌트는 React state를 사용하지 않습니다. 차트 인스턴스는 ref에 보관하고 범례는 DOM에 직접 그리므로 마우스를 움직여도 리렌더가 일어나지 않습니다. 사용자가 차트를 움직이면 최신 봉 따라가기를 멈추는데, 코드가 차트를 움직일 때도 같은 이벤트가 나기 때문에 가드 플래그로 걸러냅니다.

<details>
<summary>"실시간" 표기를 내린 이유</summary>

초기 라벨은 "실시간"이었습니다. 종목 시세는 약 1분, 지수는 1~2분 주기의 폴링이므로 표기를 내렸습니다. 라벨은 장 세션 명칭(정규장 · 애프터마켓 · 마감 시각)으로 표기하고, 갱신 주기는 [`/credits`](https://slate-kr.vercel.app/credits)에 명시했습니다. 실시간은 KIS WebSocket과 상시 연결 서버가 필요한 별개 작업입니다.

</details>

<sub>코드 · [`useStockIntraday.ts`](web/src/features/stock-intraday/useStockIntraday.ts) · [`useStockQuote.ts`](web/src/features/stock-quote/useStockQuote.ts) · [`PriceChart.tsx`](web/src/entities/chart/PriceChart.tsx)</sub><br>
<sub>글 · [#140 "실시간" 표기 제거](https://velog.io/@dh82680/SlateKR-140-지수-라벨-규칙-통일과-실시간을-내린-이유)</sub>

### 3. 서버 캐시

KIS API는 초당 호출 한도가 있는데, 홈 화면 하나가 장중에 지수 12개를 계속 갱신합니다. 응답을 서버에서 캐시해, 사용자가 늘어도 지수 · 순위 API의 KIS 호출 수가 같이 늘지 않게 하는 것이 목표였습니다.

- 페이지 전체를 캐시하는 ISR은 홈에만 적용하고, 나머지 페이지는 요청마다 서버에서 렌더합니다. 대신 지수 · 순위 API 응답을 서버에서 캐시하고, 유지 시간은 장 세션에 따라 60초에서 1시간 사이로 바꿉니다. Next.js 16의 `cacheComponents`는 앱 전체에 한 번에 적용해야 하는 옵션이라 도입하지 않았습니다.
- 실패 응답은 캐시에 남기지 않습니다. KIS 장애 때 빈 차트가 캐시 유지 시간 내내 그대로 나가는 경우가 있었고, 이후 실패를 감지하면 해당 캐시 항목을 바로 지우도록 바꿨습니다.
- 종목 상세의 DB 조회에는 시간 기반 캐시를 적용하지 않았습니다. 장 마감 후 이전 종가가 최신처럼 보일 수 있어서, 적재 후 재검증 장치가 먼저 필요하다고 판단했습니다.

<sub>코드 · [`session-cache.ts`](web/src/lib/session-cache.ts) · [`index-quotes/route.ts`](web/src/app/api/index-quotes/route.ts)</sub><br>
<sub>글 · [#075 실패 응답 캐시 결함](https://velog.io/@dh82680/SlateKR-075-intraday-실패-캐시-결함-해결) · [#174 선언만 있던 revalidate](https://velog.io/@dh82680/SlateKR-174-선언만-있던-revalidate와-한-달-멈춰-있던-차트-당일-봉)</sub>

### 4. 런타임 검증: AI 공시 요약

DART 공시 원문을 Gemini 3.8 Flash로 요약하되, 모델 응답을 검증 없이 화면에 넘기지 않는 것이 조건이었습니다.

```ts
type DisclosureSummaryContent = {
  headline: string;
  facts: { label: string; value: string }[];
  detail: string;
};
```

- 첫 버전은 문장형 요약이라 "보통주 40,179주 감소, 종류주 7,450주 증가" 같은 수치가 문장에 묻혔습니다. 그래서 출력을 위 세 필드로 고정하고, 공시 유형마다 필드를 늘리는 대신 facts의 항목 이름을 모델이 정하게 했습니다.
- Zod 스키마 하나로 Gemini에 응답 형식을 지정하고, 받은 응답도 같은 스키마로 검증합니다. 검증하는 것은 형태뿐이고, 내용이 사실인지는 확인하지 않습니다.
- 실패는 호출 한도 초과 · 시간 초과 · 안전 차단 · 형식 오류처럼 원인별로 나눠 반환하고, 화면은 원인에 따라 안내 문구와 재시도 버튼을 다르게 보여줍니다. 호출 한도 초과 · 서버 과부하 · 시간 초과 때는 Gemini 2.5 Flash로 한 번 폴백합니다.
- 클라이언트는 공시 번호와 종목 코드만 보내고, 제목 같은 프롬프트 재료는 서버가 직접 조회합니다. 요약은 사용자가 요청할 때만 만들고, 결과를 DB에 저장해 같은 공시로 다시 호출하지 않습니다.

<p align="center"><img src="docs/images/disclosure-summary.png" width="600" alt="AI 공시 요약 — 공시 행 인라인 확장"></p>

<sub>코드 · [`disclosureSummary.ts`](web/src/shared/types/disclosureSummary.ts) · [`disclosure-summary.ts`](web/src/lib/disclosure-summary.ts)</sub><br>
<sub>글 · [#019 에러 분기 설계](https://velog.io/@dh82680/SlateKR-019-AI-공시-요약-2-Gemini-API-연동과-에러-분기-설계) · [#081 출력 구조화](https://velog.io/@dh82680/SlateKR-081-AI-공시-요약-출력-구조화) · [#168 3.8 승격과 폴백](https://velog.io/@dh82680/SlateKR-168-AI-공시-요약-gemini-3.8-flash-승격-및-기존-버전-폴백-결정)</sub>

### 5. 익명 동기화

관심종목은 localStorage로 시작해서, 저장소가 지워지면 목록도 사라졌습니다. 마무리 단계에서 로그인 없이 바로 사용하는 조회형 서비스의 특성은 살리면서 브라우저를 식별해 서버에 저장하는 방식을 붙여, 쿠키만 남아 있으면 목록을 되살릴 수 있도록 했습니다.

- 식별용 UUID 쿠키(httpOnly)는 최초 저장 성공 시 서버가 발급합니다. 조회만 하는 방문자에게는 쿠키도 동기화 요청도 없습니다.
- 관심종목과 메모는 브라우저마다 각각 JSONB 스냅샷 한 행으로 저장합니다. 로그인 없이 쓰기가 열려 있어서 요청 본문은 스키마 검증과 64KB 상한을 거칩니다.
- 서버 조회에 실패한 상태에서 쓰면 비어 있는 로컬 목록이 서버 목록을 덮어쓸 수 있습니다. 그래서 조회에 성공하기 전에는 쓰지 않고 "서버 저장 안 됨" 배지를 띄웁니다. 편집 저장이 실패하면 마지막으로 서버에 저장된 상태로 되돌립니다.

<sub>코드 · [`useWatchlistSync.ts`](web/src/features/watchlist/useWatchlistSync.ts) · [`anon-id.ts`](web/src/lib/anon-id.ts)</sub><br>
<sub>글 · [#141 로그인 없는 식별과 스냅샷 동기화](https://velog.io/@dh82680/SlateKR-141-관심종목-서버-저장-로그인-없는-식별과-스냅샷-동기화)</sub>

## 품질

- 커밋 전에 `npm run check` 하나로 타입 검사 · ESLint · Vitest · 프로덕션 빌드를 실행합니다. CI는 main push와 PR마다 타입 검사 · ESLint · 테스트를 다시 실행하고, collector가 바뀌면 collector 테스트도 실행합니다.
- 테스트는 순수 함수에 집중하고, 컴포넌트 테스트는 작성하지 않았습니다. 공시 분류 · 가격 통계 · 장 세션 판정 · 차트 데이터 변환 같은 로직은 물론, 헤더 라벨 같은 화면 상태 판정도 컴포넌트 밖 함수로 분리해 테스트합니다. 공시 분류는 제목 191건 픽스처로 회귀를 확인합니다.
- 검색창은 combobox 패턴을 따라 방향키 · Enter · Escape로 탐색할 수 있습니다. 포커스는 링으로 표시하고, 대비가 부족했던 글자색 토큰은 WCAG AA 기준에 맞췄습니다.
- 모바일에서는 하단 탭 바가 내비게이션을 대신합니다.
  <p align="center"><img src="docs/images/stock-detail-mobile.png" width="240" alt="종목 상세 — 모바일, 하단 탭 바"></p>

성능은 PageSpeed Insights lab 측정값입니다(2026년 10월, 조합당 3회 중앙값, 실사용자 데이터 없음).

| 페이지    | 기기     | 성능 | 접근성 | 권장사항 | SEO | LCP  | CLS   |
| --------- | -------- | ---- | ------ | -------- | --- | ---- | ----- |
| 홈        | 모바일   | 70   | 96     | 100      | 100 | 5.6s | 0     |
| 홈        | 데스크톱 | 99   | 96     | 100      | 100 | 0.6s | 0.015 |
| 종목 상세 | 모바일   | 76   | 100    | 100      | 100 | 3.8s | 0.113 |
| 종목 상세 | 데스크톱 | 100  | 100    | 100      | 100 | 0.7s | 0.025 |
| 지수      | 모바일   | 77   | 100    | 100      | 100 | 5.4s | 0.001 |

홈 모바일은 회차마다 편차가 큽니다(성능 66 ~ 77, LCP 4.1 ~ 5.6초). LCP는 Lighthouse 시뮬레이션에서만 길게 나왔고, CPU · 네트워크를 실제로 늦춘 로컬 측정에서는 약 1.5초였습니다. 접근성 96은 캐러셀의 비활성 슬라이드를 일부러 흐리게 한 결과입니다.

<sub>코드 · [`classifyDisclosure.test.ts`](web/src/shared/utils/classifyDisclosure.test.ts) · [`SearchInput.tsx`](web/src/features/search/SearchInput.tsx) · [`BottomTabBar.tsx`](web/src/components/layout/BottomTabBar.tsx)</sub><br>
<sub>글 · [#087 Vitest 도입](https://velog.io/@dh82680/SlateKR-087-Vitest-도입과-순수함수-테스트)</sub>

## 알려진 한계

**구현 범위 제외**

- 종목 시세 · 분봉 API는 캐시하지 않았습니다. 조회가 약 2,650개 종목에 흩어져 있어 캐시해도 재사용되는 응답이 적다고 판단했습니다. 다만 사용자가 한 종목에 몰리면 KIS 호출도 사용자 수에 비례해 늘어나므로, 그런 트래픽에서는 캐시가 필요합니다.
- AI 요약에 사용자별 호출 제한이 없습니다. Gemini 무료 등급의 호출 한도를 모든 사용자가 공유하므로, 한 사용자가 연속으로 요청하면 다른 사용자도 한도에 걸릴 수 있습니다. 요약은 공시마다 한 번만 생성해 저장하고, 한도를 넘으면 별도 한도를 가진 Gemini 2.5 Flash로 폴백해 영향을 줄였습니다.

**성능 · 코드 부채**

- PageSpeed Insights 기준 모바일 LCP가 3.8 ~ 5.6초이고, 홈과 종목 상세에 렌더링 차단 CSS가 2개 있습니다. CSS를 HTML에 인라인하는 Next.js 옵션(`inlineCss`)은 로컬 측정에서 홈 HTML이 압축 기준 12KB에서 155KB로 커지고 점수가 4 ~ 6점 내려가 적용하지 않았습니다.
- 종목 상세 모바일 CLS가 0.113입니다. 헤더 · 핵심 지표 스켈레톤이 실제보다 낮고, 최근 조회 바가 hydration 뒤에 끼어듭니다.
- 장중 지수 분봉은 증분 응답 없이 매번 하루치 전체를 받습니다. KIS 호출 한도는 횟수로 차감되어 응답 분량과는 관계가 없고, 증분으로 받으면 빠지거나 바뀐 봉을 검사하는 비용이 더 크다고 판단했습니다.
- 개장 전에 연 탭을 그대로 보고 있으면 09:00이 지나도 분봉 폴링이 시작되지 않습니다. 분봉 route는 서버 캐시 없이 KIS를 호출해서 장이 닫힌 동안에는 폴링을 멈추고, 다시 시작할지는 마지막 응답의 장 세션으로 판단합니다. 폴링이 멈춘 탭에는 새 응답이 오지 않으므로, 다른 탭이나 창에 갔다가 돌아와야 재개됩니다.

**데이터**

- 다우존스는 KIS에서 장중 시세 · 분봉을 받을 수 없어 일봉 종가만 표시합니다.
- 일봉은 애프터마켓 체결까지 포함한 20:00 마감 캔들이라, 애프터마켓 거래가 있었던 종목은 정규장 종가 기준 차트와 종가 · 거래량이 다를 수 있습니다. 등락률은 전일 정규장 종가 기준입니다.
- 병합 · 분할 · 무상증자로 주식수가 바뀐 종목은 공시 EPS의 기준 주식수가 현재와 달라 PER · EPS · 시가배당률이 어긋날 수 있습니다. 감지되면 "—"와 툴팁 사유를 표시하지만, 변동 폭이 작거나 최근에 생긴 변동은 감지하지 못합니다.

## 개발 방식

조사와 코드 생성은 Claude Code에 위임했고, 설계 · 검증 · 판단은 직접 처리했습니다. 작업 세션 하나가 아래 루프 한 사이클이고, `[CC]`가 위임 구간입니다.

```
로드맵
  → 세션 계획: 이번 범위와 멈출 지점
    → [CC] 조사: 현 코드와 제약을 묻는 프롬프트 → 보고
      → 방향 결정: 보고를 근거로
        → [CC] 구현: 구현 프롬프트 → 코드 + 검사(tsc · ESLint · build · Vitest)
          → 리뷰 · 커밋: 지시와 다른 부분은 이유를 받고 채택/기각 기록
            → 개발 일지 · 블로그
              → 로드맵 갱신 ↺
```

프로젝트 지침(CLAUDE.md)에 아키텍처 원칙 · 컨벤션 · 금지 사항을 고정하고, Claude Code가 만든 코드를 리뷰하는 기준으로 사용했습니다.

작업 세션 186회 · 커밋 882 · Vitest 케이스 1,194(2026-10-25 기준). 작업 세션 단위 개발 일지는 같은 번호로 [velog 시리즈](https://velog.io/@dh82680)에 있고, 각 결정의 배경과 실측 결과는 해당 편에 정리했습니다.

## 회고

확인하지 않고 넘어간 가정이 나중에 비용으로 돌아온 일이 두 번 있었습니다. 둘 다 지금은 완료 기준에 들어가 있습니다.

- 화면은 개발 PC 밖에서 일찍 측정합니다. 지정한 웹폰트가 초기 설정 오류로 5개월 반 동안 적용되지 않았고, 그동안 PC 기본 글꼴로 그려진 화면을 기준으로 작업했습니다. CLS와 PageSpeed Insights는 마무리 단계에 측정했고, 그때 드러난 종목 상세 모바일 CLS는 한계로 남았습니다. ([#166](https://velog.io/@dh82680/SlateKR-166-스타일가이드-전수-정합과-미적용-SUIT) · [#178](https://velog.io/@dh82680/SlateKR-178-모바일-홈-자동-스크롤과-글꼴-로딩에-따른-레이아웃-변동))
- 캐시 · 구독 선언은 기능을 끝낼 때 동작으로 확인합니다. 종목 상세의 `revalidate`는 동작한 적이 없었고, 헤더와 차트의 queryKey가 달라 차트 당일 봉 갱신이 한 달간 멈춰 있었습니다. 둘 다 마무리 단계에 발견해 고쳤습니다. 발견에 쓴 확인(응답 헤더 · `next build` route 표 · 호출 수)을 완료 기준에 넣습니다. ([#174](https://velog.io/@dh82680/SlateKR-174-선언만-있던-revalidate와-한-달-멈춰-있던-차트-당일-봉))

## 로컬 실행

테스트와 타입 검사만 돌릴 때는 외부 키가 필요 없습니다. Vitest 설정이 더미 `DATABASE_URL`을 주입하므로 DB 연결 없이 통과합니다.

```bash
cd web
npm install
npm run typecheck && npm run lint && npm run test:run   # tsc --noEmit · ESLint · Vitest
cd ../collector
pip install -r requirements.txt
python -m unittest discover -s tests                    # collector 단위 테스트
```

앱 실행은 `.env.example`을 `.env.local`로 복사해 KIS · DART · Gemini API 키와 Neon `DATABASE_URL`을 채운 뒤 `npm run dev`입니다. 종목 · 시세 데이터는 `collector/` 스크립트로 적재해야 조회되므로, 동작 확인은 [Live](https://slate-kr.vercel.app)를 권장합니다.

## Author

- 이동훈 (Donghunn Lee) · Frontend Developer
- GitHub: https://github.com/Donghunn-Lee
- Email: [dh82680@gmail.com](mailto:dh82680@gmail.com)

## Credits · License

- 코드는 [MIT](LICENSE)입니다.
- 시세 · 재무 · 공시 데이터는 각 출처의 이용 조건을 따릅니다. 출처와 갱신 주기는 [`/credits`](https://slate-kr.vercel.app/credits)에 있습니다.
