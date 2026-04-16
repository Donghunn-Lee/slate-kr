@AGENTS.md

---

# CLAUDE.md — SlateKR

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

- **검색**: debounce(300ms), 중복 요청 취소(AbortController), 최소 입력 조건, 키보드 탐색, 결과 없음 처리
- **종목 상세**: Server Components + streaming, 섹션 단위 Suspense, generateMetadata
- **정규화 레이어**: DB Row → 도메인 모델 변환, 순수 함수, Zod 검증
- **fallback 구조**: 섹션별 독립 loading/error/empty, 부분 실패가 전체 실패로 번지지 않는 구조
- **관심종목**: Zustand persist, localStorage 기반 저장
- **공시**: 유형 분류, 체크포인트 배지, 요청형 AI 공시 요약 (사용자가 버튼 누를 때만 실행, 캐싱, 실패 처리 포함)

---

## 기술 스택

- **Framework**: Next.js 15 App Router
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **서버 상태**: Server Components + fetch + revalidate 우선
- **클라이언트 상태**: TanStack Query v5 (상호작용 필요한 영역만)
- **전역 UI 상태**: Zustand (관심종목, 최근 검색어, UI 상태)
- **차트**: lightweight-charts
- **유틸**: date-fns, Zod (외부 API 응답 런타임 검증), next-themes
- **DB**: MySQL (mysql2 connection pool, `lib/db.ts`)
- **데이터 수집**: Python + pykrx (collector/)
- **배포**: AWS EC2 (Next.js + MySQL 단일 인스턴스)
- **외부 API**: DART OpenAPI (공시 데이터)
- **AI 요약**: 공시 원문 기반 요약 생성 (API 미확정, Server Action 또는 API Route)

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

### export

- route 파일(`page.tsx`, `layout.tsx` 등): default export
- 컴포넌트, 훅, 유틸, 타입: named export
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

### 서버/클라이언트 경계

- 기본은 Server Component
- `use client`는 useState/useEffect, 이벤트 핸들러, 브라우저 API, 차트/입력 UI에만
- 페이지 전체를 `use client`로 만들지 않는다

### 에러/로딩/빈 상태

- 섹션 단위로 독립 처리 (한 섹션 실패가 전체 페이지 실패로 번지면 안 됨)
- `loading` / `empty` / `error` / `partial failure` 반드시 구분
- skeleton은 레이아웃 점프 최소화 목적으로만

### 캐싱

- 종목 기본 정보: revalidate 86400
- 재무 정보: revalidate 43200
- 공시 목록: revalidate 3600
- 차트 데이터: revalidate 3600

---

## 디자인 언어 — Slate 패널

SlateKR의 UI는 "slate(판)" 개념을 기반으로 한다.
페이지를 구성하는 정보 단위들이 각각 독립된 패널로 놓여있는 느낌.

- 모든 정보 섹션은 패널 단위로 시각적으로 구분된다
- 패널은 심플하고 절제된 스타일 — 장식보다 정보 구조가 우선
- 패널 간 위계는 있어야 함 (Header > 나머지 섹션)
- shadcn/ui primitive를 직접 쓰지 않고 도메인 의미가 있는 컴포넌트로 감싸서 사용
  예: `MetricCard`, `DisclosureCard`, `StockSummaryCard`

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
