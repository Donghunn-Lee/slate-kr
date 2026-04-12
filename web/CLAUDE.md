@AGENTS.md

---

# CLAUDE.md — SlateKR

## 프로젝트 정의

**SlateKR**는 국내 상장 종목의 가격·재무·공시 정보를 구조화해서 빠르게 조회하는 서비스형 웹앱이다.
핵심 플로우: **검색 → 종목 상세 → 관심종목 저장**

이 프로젝트는 투자 추천/분석 서비스가 아니다. 흩어진 종목 데이터를 읽기 쉽게 구조화해서 제공하는 **조회형 서비스**다.
포트폴리오 프로젝트이며, 서비스형 웹앱 프론트엔드 역량을 보여주는 게 핵심 목적이다.

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

## 절대 하지 말 것

- DB Row 타입이나 외부 API 응답 타입을 UI에 직접 전달
- 페이지 전체 `use client`
- 미래 확장만 가정한 추상화 레이어 추가
- 지금 단계에 필요 없는 과도한 파일 분리
- 투자 추천/분석/판단을 암시하는 표현이나 기능
- AI를 전면에 내세우는 기능 설계
- 과장된 네이밍, 지금 필요 없는 거대한 추상화

---

## 현재 완료된 작업

- [x] Next.js 15 + TypeScript strict + Tailwind v4 + shadcn/ui 세팅
- [x] 폴더 구조, ESLint/Prettier, SUIT Variable 폰트, 다크모드, TanStack Query Provider
- [x] collector/ — stocks 2659건, daily_prices 636,099건, financial_statements 2031건 적재
- [x] lib/db.ts — mysql2 connection pool
- [x] shared/types/stock.ts — DB Row 타입 + 도메인 모델 타입
- [x] lib/stocks.ts, lib/prices.ts, lib/financials.ts — DB 조회 + 정규화 함수

## 다음 작업

- [ ] 라우팅 구조 셋업 (`/`, `/stocks/[ticker]`, `/watchlist`)
- [ ] 홈 페이지 UI — 검색창 중심 레이아웃
- [ ] 검색 기능 — 자동완성, debounce, 결과 없음 처리
- [ ] 종목 상세 페이지 — lib/ 함수 연결해서 실제 데이터 출력
