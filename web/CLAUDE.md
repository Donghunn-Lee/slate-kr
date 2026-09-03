@AGENTS.md

---

# CLAUDE.md(v3) — SlateKR

## 이 프로젝트의 목적

기존 포트폴리오(AimTest 등)는 복잡한 상호작용, 상태 흐름 제어, 런타임 구조 설계 쪽 강점이 있다.
SlateKR은 그 반대 축을 보완한다.

- 검색 → 상세 → 저장으로 이어지는 전형적인 서비스형 웹앱 구조
- 외부 데이터를 조합하는 조회형 서비스 아키텍처
- SEO 가능한 공개 상세 페이지
- 서버 캐싱 / 재검증 / fallback 설계
- 데이터 밀도가 높은 화면에서의 정보 구조화

AI 공시 요약은 차별화 기능이지만, MVP 본체(검색·상세·저장 플로우)가
AI 없이도 설득력 있어야 한다. AI는 투자 판단 도구가 아니라
문서 읽기 부담을 줄여주는 도구로 포지셔닝한다.

## 프로젝트 정의

**SlateKR**는 국내 상장 종목의 가격·재무·공시 정보와 국내·해외 주요 지수 시세를
구조화해서 빠르게 조회하는 서비스형 웹앱이다.
핵심 플로우: **검색 → 종목 상세 → 관심종목 저장**

이 프로젝트는 투자 추천/분석 서비스가 아니다. 흩어진 종목 데이터를 읽기 쉽게 구조화해서 제공하는 **조회형 서비스**다.
포트폴리오 프로젝트이며, 서비스형 웹앱 프론트엔드 역량을 보여주는 게 핵심 목적이다.

## 포트폴리오 관점에서 각 기능이 보여줘야 할 것

- **검색**: debounce(300ms), 중복 요청 취소(AbortController), 최소 입력 조건, 키보드 탐색, 결과 없음 처리, /search 라우트 redirect
- **종목 상세**: Server Components + streaming, 섹션 단위 Suspense, generateMetadata
- **정규화 레이어**: DB Row → 도메인 모델 변환, 순수 함수, Zod 검증
- **fallback 구조**: 섹션별 독립 loading/error/empty, 부분 실패가 전체 실패로 번지지 않는 구조
- **관심종목**: Zustand persist, localStorage 기반 저장
- **공시**: 유형 분류, 체크포인트 배지, 요청형 AI 공시 요약
- **AI 공시 요약**: `POST /api/disclosure-summary` API Route, Gemini 기반, DART 원문 ZIP 추출 → 요약 → DB 캐시, 3필드 구조화 출력(`headline / facts[] / detail`), Zod 스키마 단일 소스(`z.toJSONSchema` → Gemini `responseJsonSchema`, 응답도 같은 스키마로 `safeParse`), discriminated union 결과 타입(`SummarizeResult`), `not_summarizable` 분기(FINANCIAL 카테고리 차단), row 인라인 확장 UI (`DisclosuresSection` 내 `DisclosureItem` + `DisclosureSummaryBody`), 503 retry 로직
- **재무 슬레이트**: 5년 연간 + 분기(Q1~Q4, Q4는 연간−Q1~Q3 파생), 20개 지표(배당 3행은 연간 전용, 성장률 3행은 YoY query-time 파생), 연간/분기 토글, 행=항목·열=기간 축 구조

---

## 기술 스택

- **Framework**: Next.js 16 App Router
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS v4 + shadcn/ui (neutral baseColor)
- **서버 상태**: Server Components + fetch + revalidate 우선
- **클라이언트 상태**: TanStack Query v5 (상호작용 필요한 영역만)
- **전역 UI 상태**: Zustand (관심종목, 최근 검색어, UI 상태)
- **차트**: lightweight-charts v5 (v4와 API 차이 큼 — v4 예제 코드 사용 금지)
- **유틸**: date-fns, Zod (외부 API 응답 런타임 검증), next-themes, @date-fns/tz (TZDate — KST/현지시각 변환)
- **테스트**: Vitest (커밋 green 기준: tsc --noEmit, ESLint, next build, vitest)
- **폰트**: SUIT Variable (로컬 로드)
- **DB**: PostgreSQL on Neon (@neondatabase/serverless, lib/db.ts)
  - neon() 호환 래퍼: 기존 `[rows, null]` 패턴 유지
  - placeholder: `$1, $2` (PostgreSQL 스타일)
- **데이터 수집**: Python (collector/)
  - 일일: fetch_prices.py (KIS, 국내 종목 EOD) / fetch_index_prices.py (KIS, 국내 지수 4종 EOD)
    / fetch_overseas_indices.py (KIS, 해외 지수 8종) / verify_daily_freshness.py (적재 검증)
  - 인트라데이: fetch_overseas_intraday.py (KIS, 해외 3종 1분봉, 30분 주기, 7일 retention)
  - 스냅샷: fetch_quote_snapshots.py (KIS, 20:10 KST UN/NX 통합 시세)
  - 주간: fetch_stocks.py (FSS) / update_corp_codes.py (DART) / fetch_shares.py (DART)
    / fetch_financials.py (DART)
  - 백필 전용: backfill_prices.py (pykrx) / backfill_index_prices.py (KRX Marketplace)
    / backfill_overseas_index_prices.py (KIS)
  - 토큰: issue_kis_token.py + kis_token.py (공용 헬퍼)
  - 공통: db.py (Neon 커넥션), 로깅, 에러 격리, incremental update
- **스케줄링**: GitHub Actions 워크플로우 5개 전부 workflow_dispatch만 사용,
  cron-job.org가 API로 트리거 (schedule 이벤트는 지연/드롭 이슈로 제거)
- **배포**: Vercel (Next.js) + Neon (PostgreSQL)
- **외부 API**: KIS OpenAPI (국내 종목/지수 시세, 해외 지수 일봉·분봉·quote), KRX Marketplace (국내 지수 과거 일봉), DART OpenAPI (공시 데이터 + 재무제표), FSS API (종목 목록)
- **AI 요약**: Gemini API (@google/genai SDK) (`lib/disclosure-summary.ts`), `POST /api/disclosure-summary` API Route, Zod 스키마 단일 소스 (`shared/types/disclosureSummary.ts`)

---

## 폴더 구조

```
src/
├── app/              # 라우트, 레이아웃, loading/error/not-found
├── components/
│   └── ui/           # shadcn 기반 primitive
├── features/         # 검색, 관심종목, 지수 quote 등 사용자 액션 중심 기능
├── entities/         # stock, disclosure, metric, index 등 도메인 표시 단위
├── shared/           # 상수, 공용 타입, 포맷터, 범용 유틸
└── lib/              # DB 조회, normalizer, 서버 유틸
```

분리 기준은 줄 수가 아니라 **책임 경계**다.
재사용되거나, 도메인 의미가 생기거나, 서버/클라이언트 책임을 나눠야 하거나, 테스트 가치가 있을 때 분리한다.
한 번만 쓰는 작은 래퍼나 route 내부에서 끝나는 단순 UI는 분리하지 않아도 된다.

### 타입 배치 규칙

- **DB Row 타입**: `lib/` 파일 내 co-locate (해당 조회 함수와 같은 파일)
- **도메인 모델**: `shared/types/` (UI가 소비하는 타입)
- UI 컴포넌트는 도메인 모델만 import. DB Row 타입을 직접 import하지 않는다.

---

## 코드 컨벤션

### 선언 스타일

```ts
// 컴포넌트, 훅, 유틸 — const + 화살표 함수
const StockCard = ({ stock }: StockCardProps) => { ... }
const useWatchlist = () => { ... }
const formatPrice = (price: number): string => { ... }

// async Server Component — async function 허용
async function StockDetailPage({ params }: PageProps) { ... }
```

### TypeScript

- props는 `type` 별칭 사용 (`interface` 지양)
- `React.FC` 사용하지 않음
- `enum` 대신 `as const` + string literal union
- `any` 금지 — 불가피하면 `unknown` + type guard
- Zod로 외부 API 응답 런타임 검증
- `import type` 적극 사용

### 에러 타입 패턴

예상 가능한 실패는 throw가 아니라 discriminated union 반환 타입으로 처리한다.

```ts
// 예: SummarizeResult
type SummarizeResult = { ok: true; data: SummaryData } | { ok: false; error: SummarizeError };

type SummarizeError =
  | { kind: "rate_limit" }
  | { kind: "timeout" }
  | { kind: "not_summarizable" }
  | { kind: "api_error"; message: string };
// ...
```

### export

- route 파일(`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` 등): default export
  (Next.js가 파일 기반 라우팅에서 직접 소비하는 파일이므로)
- 컴포넌트, 훅, 유틸, 타입: named export (선언부에서 바로 export)
- barrel export(`index.ts`): 필요한 경우만, 남용 금지

### 네이밍

- 컴포넌트 파일: PascalCase (`StockCard.tsx`)
- 훅 파일: camelCase, use 접두사 (`useWatchlist.ts`)
- 유틸/lib 파일: camelCase (`formatPrice.ts`)
- 타입: PascalCase, 접두사 없음 (`StockSummary`)
- 상수: SCREAMING_SNAKE_CASE (`MAX_WATCHLIST_SIZE`)

---

## 아키텍처 원칙

### 데이터 흐름

```
DB / 외부 API
  → lib/ (조회 + 정규화)
    → 도메인 모델 (shared/types/)
      → UI 컴포넌트
```

- UI 컴포넌트는 내부 도메인 모델만 받는다. DB Row 타입이나 외부 API 타입을 직접 받지 않는다.
- 정규화 함수는 순수 함수로 작성한다 (테스트 가능하게).
- PER/PBR/배당수익률은 DART EPS/BPS + pykrx 종가로 `lib/`에서 query time에 계산한다.
  (pykrx 자체 PER/PBR은 2025년 2월 이후 KRX 구조 변경으로 신뢰 불가)

### 서버/클라이언트 경계

- 기본은 Server Component
- `use client`는 useState/useEffect, 이벤트 핸들러, 브라우저 API, 차트/입력 UI에만
- 페이지 전체를 `use client`로 만들지 않는다

### 에러/로딩/빈 상태

- 섹션 단위로 독립 처리 (한 섹션 실패가 전체 페이지 실패로 번지면 안 됨)
- `loading` / `empty` / `error` / `partial failure` 반드시 구분
- skeleton은 레이아웃 점프 최소화 목적으로만
- DB 호출은 반드시 try-catch. `res.ok` 체크 후 `res.json()`.

### 지수 데이터

- 지수 목록 단일 소스: `shared/constants/indices.ts`의 `INDEX_REGISTRY`
- 두 소스 구조(의도적): KIS = 현재가(quote)·분봉, KRX Marketplace = 국내 지수 과거 일봉
- 표시 우선순위: quote 데이터가 bar(분봉) 데이터보다 항상 우선.
  세션 기반 bar 우선 분기를 만들지 않는다 (홈/상세 값 불일치 재발 방지)
- 셀 조립: `shared/utils/buildIndexCell.ts` 공용.
  KIS sentinel 봉·국내 세션 갭 fill 판정: `shared/utils/intradaySentinel.ts`
- 시각 표시: `@date-fns/tz` TZDate로 KST 변환 (IANA DB 위임, DST 대응)
- KIS 토큰: GitHub Actions(kis-token.yml, 12h)가 발급 → Neon `kis_token` 단일행 캐시.
  앱은 `lib/kis-token.ts`에서 모듈 캐시 → Neon(버퍼 600s) → fallback 직접 발급 순
- EOD 적재: time-cap guard (거래일이고 KST 16:00 이후에만 당일 적재),
  bypass 레버 없음, write-once 우선

### 캐싱

- 종목 기본 정보: revalidate 86400
- 재무 정보: revalidate 43200
- 공시 목록: revalidate 3600
- 차트 데이터: revalidate 3600
- AI 요약: DB 캐시 (동일 공시 재요청 방지, `disclosure_summaries` 테이블)
- 홈 / 종목 종합정보 탭 / 지수 페이지: revalidate 3600
- 지수 quote·분봉: API route 층 unstable_cache + 세션 기반 revalidate
  (국내 regular 60s·그 외 3600s / 해외 quote active 60s·idle 3600s / 해외 분봉 regular 120s·그 외 3600s)
- 지수 캐시 태그: `{도메인}-{code}-{session}` 형식.
  조회 실패(null) 시 revalidateTag로 즉시 축출 (unstable_cache는 null도 캐시하므로)
- lib/ DB 조회 유틸은 React.cache(요청 단위 memo)만 사용 —
  시간 기반 캐시는 페이지/route 층 소관

---

## 디자인 언어 — Slate 패널

SlateKR의 UI는 "slate(판)" 개념을 기반으로 한다.
페이지를 구성하는 정보 단위들이 각각 독립된 패널로 놓여있는 느낌.
심플하고 절제된 스타일로, 정보 구조가 디자인보다 우선한다.

### 베이스

- **라이트 모드 기본** — 따뜻한 오프화이트 베이스 (oklch hue 85)
  ```
  --bg-base:     oklch(0.98 0.005 85);   /* 따뜻한 오프화이트 */
  --bg-elevated: oklch(0.995 0.003 85);  /* 패널이 떠있을 때 */
  ```
- Header + 차트 섹션은 무채색(colorless) 유지

### 5-color semantic system

각 색은 bg(가장 옅음) / border / accent(아이콘·강조) 세 단계로 운용.

| 색상     | 용도      | 의미          |
| -------- | --------- | ------------- |
| Sky      | 공시      | 차분한 신뢰감 |
| Sage     | 가격 통계 | 안정·건전성   |
| Amber    | 재무      | 알림 성격     |
| Lavender | 차트      | 차별화 신호   |
| Peach    | 핵심 지표 | 개인화·따뜻함 |

관심종목은 plain(무채색) 패널을 사용한다.

### 인터랙션

- hover lift (패널 미세 부상)
- panel expand (접힌 상세 정보 펼침)
- row reveal (행 단위 정보 노출)
- number count-up (숫자 카운트업 애니메이션)

### 작업 원칙

- 디자인 작업은 `/styleguide` 페이지의 디자인과 디자인 토큰을 기준으로 한다.
- 아직 styleguide에 반영되지 않은 디자인 작업은 styleguide 우선 작업을 고려한다.
- shadcn primitive는 도메인 컴포넌트로 감싸서 사용
  예: `MetricCard`, `DisclosureCard`, `StockSummaryCard`, `CheckpointBadge`

---

## 데이터 수집 제약

- **pykrx**: 백필 전용. OHLCV만 신뢰 가능 — 시가총액/PER/PBR 함수는
  2025년 2월 KRX 구조 변경 이후 깨짐. 당일 EOD 적재는 KIS로 이관됨.
- **비ZIP DART 응답**: 집합투자증권 등 일부 공시가 ZIP이 아닌 status=014 XML 반환. 제목 키워드로 사전 필터링 불가 → 호출 시점에서 분기 처리.
- **공시 분류**: 비중요 공시는 `null` 반환. `GENERAL` 같은 포괄 fallback 없음 — 배지는 주가 관련성 신호이므로.
- **Neon serverless HTTP**: bigint를 string으로 반환 → OID 20 후처리 필요
- **unstable_cache**: null 값도 무조건 캐시됨 → 무효화는 revalidateTag로
- **GitHub Actions schedule**: 부하 시 지연/드롭 → cron-job.org 외부 트리거 사용 (전환 완료)

---

## 구현 전 점검 순서

새 코드를 쓰기 전에 순서대로 확인하고, 먼저 해결되는 지점에서 멈춘다:

1. 코드베이스에 같은 helper/util/패턴이 이미 있는가 → 재사용
2. 표준 라이브러리 또는 플랫폼 기본 기능으로 되는가
3. 이미 설치된 의존성으로 되는가
4. 그래도 없으면 최소한만 새로 작성

단, 검증·에러 처리·타입 안전성은 이 원칙의 절감 대상이 아니다.

## 수정 범위 규칙

- 변경된 모든 줄은 작업 요청에 직접 연결되어야 한다
- 무관한 코드·주석·포맷을 "개선"하지 않는다. 기존 스타일을 따른다
- 내 변경으로 생긴 orphan(미사용 import/변수)만 정리한다
- 범위 밖 dead code는 삭제하지 말고 보고만 한다

## 커밋

### scope

사용자 관점 도메인 단위로 표기한다. 폴더 이름과 반드시 일치할 필요는 없다.

- **도메인 scope**: `home` / `indices` / `stock` / `chart` / `search` / `watchlist` / `ranking` / `disclosure` / `layout` / `ui` / `styleguide` / `api`
- **디렉토리 scope** (도메인 성격 없음): `collector` / `ci`
- **`web`**: 2개 이상 도메인을 관통하는 변경에만 사용한다. 단일 도메인이면 그 도메인 scope를 쓴다.

새로운 폴더·컴포넌트 묶음이 생겨 기존 목록으로 표현이 어려운 경우, 임의로 새 scope를 만들지 말고 이 목록에 추가할지 먼저 제안한다.

### 본문

- 제목은 명령형·영문·Conventional Commits (`type(scope): Subject`)
- 본문은 명령형 불릿 2~4개, 첫 글자 대문자. "어떻게"가 아니라 "무엇을"
- 동기가 자명하지 않은 커밋(`fix`·`refactor`·되돌림 등)은 불릿 위에 이유 1~2문장을 쓴다. 자명한 `feat`은 불릿만
- 커밋 메시지는 초안만 제안한다. 커밋 실행은 지시가 있을 때만

## 절대 하지 말 것

- DB Row 타입이나 외부 API 응답 타입을 UI에 직접 전달
- 페이지 전체 `use client`
- 미래 확장만 가정한 추상화 레이어 추가
- 지금 단계에 필요 없는 과도한 파일 분리
- 투자 추천/분석/판단을 암시하는 표현이나 기능
- AI를 투자 분석/추천 도구로 포지셔닝하는 기능 설계
- "AI가 종목을 분석해드립니다" 같은 과장된 표현
- 과장된 네이밍, 지금 필요 없는 거대한 추상화
