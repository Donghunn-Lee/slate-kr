@AGENTS.md

---

# CLAUDE.md(v2) — SlateKR

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

**SlateKR**는 국내 상장 종목의 가격·재무·공시 정보를 구조화해서 빠르게 조회하는 서비스형 웹앱이다.
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
- **AI 공시 요약**: `POST /api/disclosure-summary` API Route, Gemini 기반, DART 원문 ZIP 추출 → 요약 → DB 캐시, discriminated union 결과 타입(`SummarizeResult`), `not_summarizable` 분기(FINANCIAL 카테고리 차단), Sheet 기반 사이드 드로어(`SummarySlate`), 503 retry 로직
- **재무 슬레이트**: 5년 연간 + 분기(Q1~Q3), 12개 지표, 연간/분기 토글, 행=항목·열=기간 축 구조

---

## 기술 스택

- **Framework**: Next.js 15 App Router
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS v4 + shadcn/ui (neutral baseColor)
- **서버 상태**: Server Components + fetch + revalidate 우선
- **클라이언트 상태**: TanStack Query v5 (상호작용 필요한 영역만)
- **전역 UI 상태**: Zustand (관심종목, 최근 검색어, UI 상태)
- **차트**: lightweight-charts
- **유틸**: date-fns, Zod (외부 API 응답 런타임 검증), next-themes
- **폰트**: SUIT Variable (로컬 로드)
- **DB**: PostgreSQL on Neon (@neondatabase/serverless, lib/db.ts)
  - neon() 호환 래퍼: 기존 `[rows, null]` 패턴 유지
  - placeholder: `$1, $2` (PostgreSQL 스타일)
- **데이터 수집**: Python + pykrx (collector/)
  - `fetch_prices.py` — OHLCV 일별 시세
  - `fetch_financials.py` — DART 재무제표
  - `fetch_shares.py` — 발행주식수
  - `fetch_stocks.py` — 종목 목록 (FSS API)
  - 공통: 로깅, 에러 격리, incremental update
- **배포**: Vercel (Next.js) + Neon (PostgreSQL)
- **외부 API**: DART OpenAPI (공시 데이터 + 재무제표), FSS API (종목 목록)
- **AI 요약**: Gemini API (`summarize-disclosure.ts`), `POST /api/disclosure-summary` API Route

---

## 폴더 구조

```
src/
├── app/              # 라우트, 레이아웃, loading/error/not-found
├── components/
│   └── ui/           # shadcn 기반 primitive
├── features/         # 검색, 관심종목 등 사용자 액션 중심 기능
├── entities/         # stock, disclosure, metric 등 도메인 표시 단위
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

### 캐싱

- 종목 기본 정보: revalidate 86400
- 재무 정보: revalidate 43200
- 공시 목록: revalidate 3600
- 차트 데이터: revalidate 3600
- AI 요약: DB 캐시 (동일 공시 재요청 방지, `disclosure_summaries` 테이블)

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
| Sky      | 핵심 지표 | 차분한 신뢰감 |
| Sage     | 재무 요약 | 안정·건전성   |
| Amber    | 공시      | 알림 성격     |
| Lavender | AI 요약   | 차별화 신호   |
| Peach    | 관심종목  | 개인화·따뜻함 |

### 인터랙션

- hover lift (패널 미세 부상)
- panel expand (접힌 상세 정보 펼침)
- row reveal (행 단위 정보 노출)
- number count-up (숫자 카운트업 애니메이션)

### 작업 원칙

- 디자인 작업은 `/styleguide` 페이지의 디자인과 디자인 토큰을 기준으로 한다.
- 아직 styleguide에 반영되지 않은 디자인 작업은 styleguide 우선 작업을 고려한다.
- shadcn primitive는 도메인 컴포넌트로 감싸서 사용
  예: `MetricCard`, `DisclosureCard`, `StockSummaryCard`, `CheckpointBadge`, `SummarySlate`

---

## 데이터 수집 제약

- **pykrx**: OHLCV만 신뢰 가능. 시가총액/PER/PBR 함수는 2025년 2월 KRX 구조 변경 이후 깨짐.
- **비ZIP DART 응답**: 집합투자증권 등 일부 공시가 ZIP이 아닌 status=014 XML 반환. 제목 키워드로 사전 필터링 불가 → 호출 시점에서 분기 처리.
- **공시 분류**: 비중요 공시는 `null` 반환. `GENERAL` 같은 포괄 fallback 없음 — 배지는 주가 관련성 신호이므로.

---

## 절대 하지 말 것

- DB Row 타입이나 외부 API 응답 타입을 UI에 직접 전달
- 페이지 전체 `use client`
- 미래 확장만 가정한 추상화 레이어 추가
- 지금 단계에 필요 없는 과도한 파일 분리
- 투자 추천/분석/판단을 암시하는 표현이나 기능
- AI를 투자 분석/추천 도구로 포지셔닝하는 기능 설계
- "AI가 종목을 분석해드립니다" 같은 과장된 표현
- 과장된 네이밍, 지금 필요 없는 거대한 추상화
