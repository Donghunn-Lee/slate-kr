# SlateKR

> 국내 상장 종목의 가격·재무·공시와 국내·해외 주요 지수를 한 화면에 구조화하는 조회형 웹앱
>
> 외부 데이터 소스 4개를 조합하는 서비스에서 **갱신 주기 · 장애 폴백 · 데이터 검증**을 어떻게 설계했는지에 집중한 개인 프로젝트

<!-- [IMG-01] 홈 히어로 — 헤드라인 + 온전한 카드 1~2장(잘린 카드 금지). 데스크톱 -->
<img src="https://github.com/user-attachments/assets/9b76fd1d-cdca-4f71-8beb-8a5b464ab5c4" width="100%" alt="홈 히어로 — 헤드라인과 지수 카드">

<!--> 🔗 [**Live**](https://slate-kr.vercel.app) &nbsp;·&nbsp; 🎬 [**Demo**](#) — 검색 → 종목 상세 → 관심종목 저장, 1분 -->
> 🔗 [**Live**](https://slate-kr.vercel.app) &nbsp;·&nbsp;
>
> 2026.04 – 2026.09 &nbsp;·&nbsp; 1인 개발 — 수집 파이프라인 · 프론트엔드 · 배포 · 운영

<!-- Demo 링크(#)는 데모 영상 후 교체 -->

---

## 💡 배경

이전 프로젝트([AimTest](https://github.com/Donghunn-Lee/aimtest))는 Canvas 렌더 루프와 프레임 단위 상태 제어가 중심이었습니다. 실무에서 더 자주 마주치는 쪽은 그 반대 — **외부 데이터를 조합하고, 캐시하고, 장애를 묻어두지 않으면서 화면을 유지하는 일**입니다. SlateKR은 이 축을 검색 → 상세 → 저장이라는 전형적인 서비스 구조 위에서, 수집 파이프라인부터 배포·운영까지 혼자 완결하기 위해 시작했습니다.

투자 추천·분석 기능은 의도적으로 배제했습니다. 흩어진 데이터를 읽기 쉽게 만드는 것이 이 서비스의 범위입니다.

---

## 🖥️ 주요 화면

<!-- [IMG-02~05] 화면 전체가 아닌 핵심 영역 크롭. 줌 125~150%로 캡처해 600px에서 1:1 근처 유지. 02·04·05는 정규장 중 -->

<table>
  <tr>
    <td width="50%" align="center">
      <b>홈</b><br>
      국내 4·해외 8 지수 장중 갱신<br>
      <img src="https://github.com/user-attachments/assets/c0a35afd-0d38-4eb3-a09e-2662a7b368ee" width="100%" alt="홈 — 지수 그리드">
    </td>
    <td width="50%" align="center">
      <b>검색</b><br>
      300ms debounce, AbortController 취소, 키보드 탐색<br>
      <img src="https://github.com/user-attachments/assets/3d5101b9-4e21-419b-92ba-dfad367c53d0" width="100%" alt="검색 드롭다운">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>종목 상세</b><br>
      가격 통계 · 차트 · 핵심 지표 · 5년 재무 슬레이트 · 공시<br>
      <img src="https://github.com/user-attachments/assets/9dc690a5-36f6-416d-8a1e-ca39fa2e487f" width="100%" alt="종목 상세 — 헤더와 핵심 지표">
    </td>
    <td width="50%" align="center">
      <b>관심종목 · 메모</b><br>
      로그인 없이 서버 저장 · 유실 복구<br>
      <img src="https://github.com/user-attachments/assets/d97e81ee-63fd-4016-9b35-fdd02a072475" width="100%" alt="관심종목과 메모">
    </td>
  </tr>
</table>

UI는 "slate(판)" 메타포입니다. 정보 단위마다 독립 패널, 공시·가격·재무·차트·지표에 5색 semantic 컬러. 토큰과 컴포넌트는 [`/styleguide`](https://slate-kr.vercel.app/styleguide)에 먼저 등재하고 이를 기준으로 구현했습니다. shadcn은 Popover·Tooltip 같은 상호작용 primitive에만 쓰고, 표시 컴포넌트는 토큰 기반으로 직접 구현했습니다.

---

## 🏗️ 아키텍처

```
DB / 외부 API
  → lib/            조회 + 정규화 (순수 함수 · Zod 검증: 외부 API 응답 · JSONB 스냅샷 · 요청 바디)
    → shared/types/ 도메인 모델
      → UI          도메인 모델만 소비
```

`lib/`의 정규화 레이어가 경계입니다. DB Row 타입과 외부 API 응답 타입은 이 경계를 넘지 않습니다 — route 파일 안의 SQL 0건, UI의 DB Row·외부 API 타입 import 0건(코드베이스 전수 확인).

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

분리 기준은 줄 수가 아니라 책임 경계입니다. 한 번만 쓰는 래퍼나 route 안에서 끝나는 UI는 분리하지 않았습니다.

| 데이터 | 위치 | 이유 |
|---|---|---|
| 종목 기본 정보 · 재무 · 공시 · 차트 | Server Component(요청 시 서버 렌더) | 읽기 전용, SEO. DB는 요청마다 조회, DART만 fetch revalidate |
| 지수 시세 · 분봉 | Client + TanStack Query | 장 세션별 폴링 주기, 탭 복귀 처리 |
| 관심종목 · 메모 · 최근 조회 | Zustand persist + 익명 서버 스냅샷 | 사용자 소유 데이터, 로그인 없음 |

`use client`는 이벤트·브라우저 API·차트·입력 UI에만 씁니다. 페이지 단위 client 컴포넌트는 없습니다.

---

## ⚖️ 설계 결정

### 1. 갱신 전략 — 호출 한도 안의 캐시 계층

KIS API는 초당 호출 한도가 있고, 홈 한 화면이 지수 12셀을 장중에 갱신합니다. route 캐시가 요청을 병합해 KIS 호출 수를 사용자 수와 분리하는 것이 목표였습니다.

- **페이지 층** — 페이지 단위 캐시(ISR)는 홈 1h뿐. 종목 상세·지수·순위·검색은 요청 시 서버 렌더이고 캐시는 데이터 단위 — 지수·순위 KIS는 route `unstable_cache`, DART 공시 목록·기업개황은 fetch `revalidate`, AI 요약은 DB, DB 조회는 요청 단위 중복 제거(`React.cache`)만
- **route 층** — `unstable_cache` + 장 세션별 TTL. 국내 장중 60초 · 장외 1시간, 해외는 세션별 별도
- **`lib/` 층** — `React.cache`로 요청 단위 중복 제거가 기본. 시간 기반 캐시는 예외 3곳(DART fetch `revalidate` · KIS 토큰 모듈 캐시 · 장 캘린더 모듈 memo)이고, Route Handler에서는 `React.cache`가 동작하지 않음

**의도치 않은 negative caching.** KIS 일시 장애 시 빈 차트가 캐시에 남아 복구 후에도 TTL 동안 서빙됐습니다. `unstable_cache`는 `null`도 직렬화해 저장하므로(`JSON.stringify(null) === "null"`) 저장 시점에 막을 수 없었고, **실패 감지 즉시 `revalidateTag`로 무효화**하는 방식으로 전환했습니다(국내·해외 지수 quote·분봉 4개 route와 순위 route). 전제로 빈 값(`[]`)과 실패(`null`)를 데이터 층에서 분리했습니다.

**분봉 호출 축소.** 1분봉 API를 30분 단위로 fan-out하면 종목당 최대 26회(30분 anchor 25 + 전일 tail 1). 실측에서 15회 중 4회가 HTTP 500으로 떨어졌고, 결손 구간이 정상 봉으로 렌더되는 **silent failure**였습니다. 120분 단위 API로 전환해 최대 7회(anchor 6 + 전일 tail 1, 재시도 제외)로 줄이고, 응답을 분 단위 슬롯으로 채워(densify) 시간축을 유지했습니다.

"실시간" 표기는 제거했습니다. 1초 폴링으로 정당화하는 안도 검토했지만, route 캐시가 사용자 수를 흡수하는 구조에서 병목은 KIS가 아니라 함수 호출 수이고, REST 폴링은 간격과 무관하게 push가 아닙니다. 라벨은 장 세션 명칭(정규장 · 애프터마켓 · 마감 시각)으로 표기하고, 갱신 주기는 `/credits`에 명시했습니다.

→ [#075 실패 응답 캐시 결함](https://velog.io/@dh82680/SlateKR-075-intraday-실패-캐시-결함-해결) · [#140 "실시간" 표기 제거](https://velog.io/@dh82680/SlateKR-140-지수-라벨-규칙-통일과-실시간을-내린-이유) · [#155 120봉 API 전환](https://velog.io/@dh82680/SlateKR-155-코드로만-종결한-두-판정과-120봉-TR-전환)

### 2. 장애 격리와 폴백

종목 상세 한 페이지가 4~5개 외부 소스에 의존합니다. 초기 구현은 섹션별 `try-catch` → 빈 배열 폴백으로, 페이지는 유지됐지만 **빈 값과 조회 실패가 구분되지 않았습니다.** `/api/prices`는 `Promise.all`이라 종목 하나의 실패가 전체 500으로 번졌습니다.

- 섹션 단위 격리 — loading / empty / error / **부분 실패**(값 유지 + "일시 지연" 배지) 네 상태 분리. 색·아이콘 추가 없이 메시지로만 구분
- 다건 조회는 `allSettled`. 지수 셀은 실패 셀만 종가 기준 값 + "종가 기준" 캡션으로 graceful degradation, 나머지 정상 렌더
- 종목 분봉은 실패 구간 1회 재시도 → 잔여 실패 시 `failed: true` 응답 → 클라이언트는 직전 정상 응답(last-known-good) 유지

**예외 — 첫 로드는 partial 응답을 렌더하지 않음.** 직전 정상 응답이 없으면 결손 구간이 "체결 없음"과 구분되지 않아 silent failure가 재현되므로, 이 경우만 재시도 UI로 처리합니다.

→ [#037 empty와 error 분리](https://velog.io/@dh82680/SlateKR-037-fallback-점검-empty와-error를-구분하기) · [#155 폴백 표면 통일과 분봉 실패 창](https://velog.io/@dh82680/SlateKR-155-코드로만-종결한-두-판정과-120봉-TR-전환)

### 3. AI 공시 요약 — 스키마 검증과 폴백

DART 공시 원문의 읽기 부담을 Gemini 요약으로 줄이되, LLM 응답을 검증 없이 UI에 넘기지 않는 것이 조건이었습니다.

첫 버전은 2~4문단 산문이었습니다. "보통주 40,179주 감소, 종류주 7,450주 증가, 순감 32,729주" 같은 핵심 수치가 문장 안에 묻혀 스캔이 불가능했습니다. 공시 유형별 고정 필드는 계속 늘어나므로, structured output으로 **필드는 셋으로 고정하고 라벨만 모델에 맡겼습니다.**

```ts
{ headline: string; facts: { label: string; value: string }[]; detail: string }
```

- Zod 스키마가 단일 소스(single source of truth) — `z.toJSONSchema` → Gemini `responseJsonSchema`, 응답도 동일 스키마로 `safeParse`. `maxItems` 같은 제약이 스키마 레벨에서 강제
- 결과는 discriminated union — 실패 7종(`rate_limit · timeout · safety_blocked · empty_response · parse_failed · not_summarizable · api_error`)이 타입으로 구분. 환경 오류(API 키 미설정)만 fail-fast throw
- 클라이언트 입력은 `{ rcept_no, ticker }`뿐. 제목·회사명은 서버가 DART 공시 목록에서 조회 — 클라 문자열이 프롬프트와 공유 캐시에 닿는 경로를 차단
- primary gemini-3.8-flash, 429·503 소진·timeout 시 gemini-2.5-flash로 1회 폴백(요청 예산 55s 안에서 503 backoff). 무료 티어의 503 스파이크와 일일 한도를 폴백 하나로 흡수
- 동일 공시는 DB 캐시. 요약은 사용자 요청 시에만 실행

이 스키마에는 `impact`·`sentiment` 같은 **판단 축이 들어갈 자리가 없습니다.** 투자 판단 배제 원칙을 스키마가 강제합니다.

<!-- [IMG-08] 공시 행 인라인 확장 — headline / facts / detail. 16:00 이후 3.8 확인 요청과 겸해 캡처 -->
<p align="center"><img src="https://github.com/user-attachments/assets/99f50875-0fe1-4bc4-9a8f-61c6f0b32b5b" width="600" alt="AI 공시 요약 — 공시 행 인라인 확장"></p>

→ [#019 에러 분기 설계](https://velog.io/@dh82680/SlateKR-019-AI-공시-요약-2-Gemini-API-연동과-에러-분기-설계) · [#081 출력 구조화](https://velog.io/@dh82680/SlateKR-081-AI-공시-요약-출력-구조화) · [#168 3.8 승격과 폴백](https://velog.io/@dh82680/SlateKR-168-AI-공시-요약-gemini-3.8-flash-승격-및-기존-버전-폴백-결정)

### 4. 익명 동기화 — 로그인 없는 관심종목 서버 저장

관심종목은 localStorage로 시작했습니다. 인증을 붙이는 순간 조회형 서비스의 범위를 넘는다고 봤고, 대신 기기 간 동기화와 저장소 유실 복구를 포기했습니다. 마무리 단계에서 **로그인 없이 브라우저를 식별해 서버에 저장**하는 방식으로 후자만 되돌렸습니다.

- 식별자는 서버 발급 UUID(httpOnly `slatekr_uid`) + JS 판독용 마커(`slatekr_sync`) 쿠키 2개. 첫 저장 성공 시점에 지연 발급하고 마커가 없으면 GET도 생략 — 조회만 하는 방문자에겐 쿠키도 서버 호출도 없음(예외: 마커 없이 로컬 관심종목이 남아 있으면 로드 시 마이그레이션 PUT 1회)
- 저장 단위는 정규화 테이블이 아닌 **JSONB 스냅샷 1행**. 정규화의 이점을 쓰는 곳이 없고, Neon HTTP 드라이버는 대화형 트랜잭션 미지원
- 기준 상태는 Zustand, 서버는 백업. **server-wins 단방향 동기화** — 로드 성공 시 서버가 로컬을 덮고, 로드 실패 시 쓰기 차단

쓰기 차단의 이유: localStorage 유실 + 서버 조회 실패 상태에서 종목 하나를 추가하면 stale 로컬이 서버 전체 목록을 덮어씁니다. 조회 성공 이력이 없으면 쓰지 않고, 차단 상태는 패널 헤더에 "서버 저장 안 됨" 배지로 노출합니다. 양방향 병합·충돌 해결은 두지 않으며, 종목별 메모는 같은 흐름을 단순화해 따르고(pagehide flush 판정만 공용 유틸) 공용 훅 추출은 보류했습니다(rule of three).

→ [#141 로그인 없는 식별과 스냅샷 동기화](https://velog.io/@dh82680/SlateKR-141-관심종목-서버-저장-로그인-없는-식별과-스냅샷-동기화)

---

## ✅ 품질

커밋 기준: `tsc --noEmit` · ESLint · `next build` · Vitest 전부 green.

테스트는 **순수 함수**에 집중 — 공시 분류, TTM EPS, 가격 통계, 봉 리샘플링, 장 세션 판정, 분봉 슬롯 채움 등 1,111 케이스.

- 시간 의존 함수는 `now` 의존성 주입이 기본
- 실제 공시 176건 픽스처로 "거래소 발신 공시에 특정 카테고리 불가" 같은 불변식(invariant) 검증
- 도달 불가 방어 코드는 커버리지 수치를 위해 제거하거나 억지 입력을 만들지 않음
- 컴포넌트 테스트 미도입 — 현 단계 투자 대비 효과가 낮다고 판단

→ [#087 Vitest 도입](https://velog.io/@dh82680/SlateKR-087-Vitest-도입과-순수함수-테스트)

---

## 🔄 데이터 파이프라인

Python collector가 KIS · DART · FSS · KRX에서 수집해 Neon(PostgreSQL)에 적재합니다.

- 일일 종목 목록 · EOD(종목·국내 지수·해외 지수) · 주식 수 · 거래일 캘린더 · 국내/해외 지수 분봉 · 마감 후 시세 스냅샷
- 주간: 재무제표 · 배당 · 상장일
- GitHub Actions `schedule`은 부하 시 지연·드롭 → 전부 `workflow_dispatch` + cron-job.org 트리거
- 종목 일봉은 KRX 애프터마켓 마감(20:00) 캔들. 거래일 20:12 KIS 시세로 적재 — KIS 일봉 API는 D+1 밤에 정규장 정의로 정정되어 저장 축과 어긋나므로 당일 소스로 쓰지 않음
- 적재 게이트는 거래일 · 20:05 이후 · 멱등(write-once)

---

## 🛠️ Tech Stack

| | |
|---|---|
| **Frontend** | ![Next.js 16](https://img.shields.io/badge/Next.js_16-24292F?style=flat&logo=nextdotjs&logoColor=white) ![TypeScript strict](https://img.shields.io/badge/TypeScript_strict-3178C6?style=flat&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white) ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-24292F?style=flat&logo=shadcnui&logoColor=white) ![TanStack Query v5](https://img.shields.io/badge/TanStack_Query_v5-FF4154?style=flat&logo=reactquery&logoColor=white) ![Zustand](https://img.shields.io/badge/Zustand-555?style=flat) ![lightweight-charts v5](https://img.shields.io/badge/lightweight--charts_v5-555?style=flat) ![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat&logo=zod&logoColor=white) |
| **Infra** | ![Neon PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=flat&logo=neon&logoColor=black) ![Vercel](https://img.shields.io/badge/Vercel-24292F?style=flat&logo=vercel&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat&logo=githubactions&logoColor=white) ![cron-job.org](https://img.shields.io/badge/cron--job.org-555?style=flat) |
| **Data** | ![Python collector](https://img.shields.io/badge/Python_collector-3776AB?style=flat&logo=python&logoColor=white) ![KIS OpenAPI](https://img.shields.io/badge/KIS_OpenAPI-555?style=flat) ![DART OpenAPI](https://img.shields.io/badge/DART_OpenAPI-555?style=flat) ![FSS API](https://img.shields.io/badge/FSS_API-555?style=flat) ![KRX Marketplace](https://img.shields.io/badge/KRX_Marketplace-555?style=flat) |
| **AI · Test** | ![Gemini API](https://img.shields.io/badge/Gemini_API-8E75B2?style=flat&logo=googlegemini&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white) |

---

## 🧪 로컬 실행

검증만이면 외부 키 없이 됩니다. Vitest 설정이 더미 `DATABASE_URL`을 주입하므로 DB 연결 없이 통과합니다.

```bash
cd web
npm install
npm run typecheck && npm run lint && npm run test:run   # tsc --noEmit · ESLint · Vitest 1,111 케이스
```

앱 실행 — `.env.example`을 `.env.local`로 복사해 KIS · DART · KRX · Gemini API 키와 Neon `DATABASE_URL`을 채운 뒤 `npm run dev`. 종목·시세 데이터는 `collector/` 스크립트로 적재해야 조회되므로, 동작 확인은 [Live](https://slate-kr.vercel.app)를 권장합니다.

---

## ⚠️ 알려진 한계

- 투자 추천·분석·판단 기능 없음. 향후에도 배제
- 시세 갱신 주기 종목 약 1분 · 지수 1~2분. 실시간은 KIS WebSocket + 상시 연결 서버가 필요한 별개 작업
- 일봉 고가·저가·종가는 애프터마켓 체결 포함, 거래량은 대량매매 포함 누적. 등락률은 전일 정규장(15:30) 종가 기준가 — 증권사·네이버 시세창과 같은 축이나, 네이버 차트와는 소수 종목에서 거래량·종가 차이 가능
- KIS 순간 호출 초과 시 HTTP 500 — 종목 분봉은 재시도 + 직전 정상 응답 유지, 지수는 종가 기준 폴백
- PER·PBR·시가총액은 DART EPS/BPS + 종가로 직접 계산. 2025년 2월 KRX 구조 변경 이후 기존 라이브러리 값 신뢰 불가

**주식수가 바뀐 종목의 지표.** PER·EPS·시가배당률은 공시 EPS와 현재 주가를 조합하므로, 병합·분할·무상증자로 주식수가 바뀐 종목은 EPS의 기준 주식수가 현재와 달라 값이 어긋날 수 있습니다.

- 감지된 경우 — EPS가 전제한 주식수(순이익 ÷ EPS)가 현재 상장주식수와 크게 다르거나 등록된 무상증자의 권리락 전 기간이면, 핵심 지표의 PER·EPS·시가배당률을 "—"로 표시하고 툴팁에 사유를 노출(재무 슬레이트는 해당 기간 PER만 "—")
- 감지되지 않는 경우 — 변동 폭이 작거나 최근에 발생한 주식수 변동, 12월 결산이 아닌 종목의 분기 값. 다른 서비스와 값이 다를 수 있음

---

## 🤖 개발 방식

조사와 코드 생성은 Claude Code에 위임했고, 설계·검증·판단은 직접 처리했습니다. 세션 하나가 아래 루프 한 사이클이며, `[CC]`가 위임 구간입니다.

```
로드맵
  → 세션 계획 — 이번 범위와 정지점
    → [CC] 조사 — probe 프롬프트 → 현 코드·제약 보고
      → 방향 결정 — 보고를 근거로. 추측 구현 없음
        → [CC] 구현 — 구현 프롬프트 → 코드 + 게이트(tsc · ESLint · build · Vitest)
          → 리뷰 · 커밋 — 지시와 다른 부분은 이유를 받고 채택/기각 기록
            → 개발 일지 · 블로그
              → 로드맵 갱신 ↺
```

- 프로젝트 지침(CLAUDE.md)에 아키텍처 원칙·컨벤션·금지 사항을 고정 — 생성 코드가 벗어나면 리뷰에서 걸리는 기준선
- 판단이 필요한 선택은 실측으로 — AI 요약 모델 교체는 원문 기준 rubric을 먼저 고정하고 모델명을 가린 blind 채점으로 결정
- 결정 배경은 세션 단위 개발 일지와 블로그에 — 코드보다 "왜"를 추적 가능하게

---

## 📝 개발 기록

<!-- 커밋 수: git rev-list --count main -->
세션 169회 · 커밋 759 · 테스트 1,111

세션 단위 개발 일지를 같은 번호로 [velog 시리즈](https://velog.io/@dh82680)에 정리했습니다. 각 결정의 배경과 실측 결과는 해당 편에 있습니다.

---

## 👤 Author

- 이동훈 (Donghunn Lee) · Frontend Developer
- GitHub: https://github.com/Donghunn-Lee
- Email: [dh82680@gmail.com](mailto:dh82680@gmail.com)
