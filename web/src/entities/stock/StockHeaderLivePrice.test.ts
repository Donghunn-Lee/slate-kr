import { describe, it, expect } from "vitest";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession, QuoteMarket } from "@/shared/utils/market";
import { getKrxSessionState } from "@/shared/utils/market";
import { isClosedLikeMiss, isPreMarketReset } from "./StockHeaderLivePrice";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-07-23 은 목요일 거래일, 2026-07-25 는 토요일, 2026-01-01 은 휴장일.
const TRADING_DAY = { y: 2026, m: 7, d: 23 };
const t = (h: number, min = 0): Date =>
  kst(TRADING_DAY.y, TRADING_DAY.m, TRADING_DAY.d, h, min);

const q = (over: Partial<StockQuote> = {}): StockQuote => ({
  ticker: "000660",
  price: 1_711_000,
  change: 3_000,
  changeRate: 0.18,
  sign: "up",
  open: 1_713_000,
  high: 1_736_000,
  low: 1_698_000,
  volume: 100_000,
  ...over,
});

describe("isPreMarketReset — 정규장 개장 전 KRX 기준 0% 리셋 창", () => {
  it("07:30 preopen · KRX → false (이른 preopen 은 창 밖)", () => {
    expect(isPreMarketReset("preopen", "krx", t(7, 30))).toBe(false);
  });
  it("08:20 pre · KRX → true", () => {
    expect(isPreMarketReset("pre", "krx", t(8, 20))).toBe(true);
  });
  it("08:20 pre · NXT → false (프리마켓 실거래 보존)", () => {
    expect(isPreMarketReset("pre", "nxt", t(8, 20))).toBe(false);
  });
  it("08:55 preopen · KRX → true (늦은 preopen 도 창 안)", () => {
    expect(isPreMarketReset("preopen", "krx", t(8, 55))).toBe(true);
  });
  it("08:55 preopen · NXT → false (08:50 종가 보존, 창 전체 동일 취급)", () => {
    expect(isPreMarketReset("preopen", "nxt", t(8, 55))).toBe(false);
  });
  it("09:10 regular → false", () => {
    expect(isPreMarketReset("regular", "krx", t(9, 10))).toBe(false);
    expect(isPreMarketReset("regular", "nxt", t(9, 10))).toBe(false);
  });
  it("after / after_close / closed → false (isClosedLikeMiss 경로)", () => {
    expect(isPreMarketReset("after", "krx", t(16, 0))).toBe(false);
    expect(isPreMarketReset("after_close", "krx", t(21, 0))).toBe(false);
    expect(isPreMarketReset("closed", "krx", kst(2026, 7, 25, 10, 0))).toBe(false);
  });
  it("휴장일 08:30 → false (창 시각이어도 거래일이 아니면 리셋 없음)", () => {
    expect(isPreMarketReset("closed", "krx", kst(2026, 1, 1, 8, 30))).toBe(false);
  });
  it("08:55 · 서버 session 이 stale 한 after_close → false (세션 게이트)", () => {
    // preopen 구간엔 폴링이 멈춰 전날 저녁 응답이 남을 수 있다. 시계만 보면 창 안이지만
    // 세션이 개장 전이 아니므로 isClosedLikeMiss 경로에 그대로 맡긴다.
    expect(isPreMarketReset("after_close", "krx", t(8, 55))).toBe(false);
  });
  it("now=null → false (SSR·첫 렌더)", () => {
    expect(isPreMarketReset("pre", "krx", null)).toBe(false);
  });
  it("undefined session · 08:20 → false (초기 로드 스켈레톤)", () => {
    expect(isPreMarketReset(undefined, "krx", t(8, 20))).toBe(false);
  });
});

// 창 안에서 결과를 가르는 축은 탭 하나뿐 — 종목의 live 유무는 술어 인자가 아니다.
// NXT 상장 종목의 KRX 탭(live 있음)이 리셋에서 빠지던 회귀를 고정한다.
// live 열은 "이 상황의 종목에 오늘 값이 있는가" 를 명시할 뿐 호출에 들어가지 않는다.
describe("isPreMarketReset — 창 안 market × live 조합", () => {
  const cases: { name: string; market: QuoteMarket; live: string; expected: boolean }[] = [
    { name: "KRX 탭 · NXT 미상장(live 없음)", market: "krx", live: "null", expected: true },
    { name: "KRX 탭 · NXT 상장(live 있음)", market: "krx", live: "quote", expected: true },
    { name: "NXT 탭 · live 없음", market: "nxt", live: "null", expected: false },
    { name: "NXT 탭 · live 있음", market: "nxt", live: "quote", expected: false },
  ];
  const IN_WINDOW: { name: string; session: KrxSession; now: Date }[] = [
    { name: "08:20 pre", session: "pre", now: t(8, 20) },
    { name: "08:55 늦은 preopen", session: "preopen", now: t(8, 55) },
  ];

  for (const w of IN_WINDOW) {
    for (const c of cases) {
      it(`${w.name} · ${c.name} → ${c.expected} (live=${c.live} 무관)`, () => {
        expect(isPreMarketReset(w.session, c.market, w.now)).toBe(c.expected);
      });
    }
  }
});

// 컴포넌트가 술어에 넘기는 세션 축. 응답이 없을 때만(KRX 탭 개장 전 창은 enabled:false 라
// session 이 영영 undefined) 클라 시계 세션으로 대체한다.
const tabSession = (
  session: KrxSession | undefined,
  now: Date,
): KrxSession => session ?? getKrxSessionState(now);

// KRX 탭 개장 전 창 — 쿼리가 꺼져 서버 세션이 오지 않는 경로.
// NXT 상장 종목의 KRX 탭이 전일 축(등락 잔존)으로 남던 회귀를 고정한다.
describe("isPreMarketReset — 응답 없는 KRX 탭의 클라 세션 축 폴백", () => {
  const cases: {
    name: string;
    session: KrxSession | undefined;
    market: QuoteMarket;
    now: Date;
    expected: boolean;
  }[] = [
    { name: "08:20 · 응답 없음 · KRX 탭", session: undefined, market: "krx", now: t(8, 20), expected: true },
    { name: "08:55 · 응답 없음 · KRX 탭", session: undefined, market: "krx", now: t(8, 55), expected: true },
    { name: "07:30 · 응답 없음 · KRX 탭 (이른 preopen 은 창 밖)", session: undefined, market: "krx", now: t(7, 30), expected: false },
    { name: "10:00 · 응답 없음 · KRX 탭 (정규장)", session: undefined, market: "krx", now: t(10, 0), expected: false },
    { name: "16:00 · 응답 없음 · KRX 탭 (after)", session: undefined, market: "krx", now: t(16, 0), expected: false },
    { name: "08:20 · 응답 없음 · NXT 탭 (탭 보존 예외 유지)", session: undefined, market: "nxt", now: t(8, 20), expected: false },
    { name: "08:55 · 응답 없음 · NXT 탭", session: undefined, market: "nxt", now: t(8, 55), expected: false },
    { name: "휴장일 08:30 · 응답 없음 · KRX 탭", session: undefined, market: "krx", now: kst(2026, 1, 1, 8, 30), expected: false },
    { name: "토요일 08:30 · 응답 없음 · KRX 탭", session: undefined, market: "krx", now: kst(2026, 7, 25, 8, 30), expected: false },
    // 지연 창(EOD 미적재)은 fetch 가 살아있어 서버 세션이 온다 — 그 축이 그대로 정본.
    { name: "08:20 · 지연 창 응답 pre · KRX 탭", session: "pre", market: "krx", now: t(8, 20), expected: true },
    { name: "08:55 · 지연 창 응답 preopen · KRX 탭", session: "preopen", market: "krx", now: t(8, 55), expected: true },
    // 응답이 있으면 stale 이어도 서버 세션이 이긴다 (isClosedLikeMiss 와 같은 축 유지).
    { name: "08:55 · stale 응답 after_close · KRX 탭", session: "after_close", market: "krx", now: t(8, 55), expected: false },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expected}`, () => {
      expect(
        isPreMarketReset(tabSession(c.session, c.now), c.market, c.now),
      ).toBe(c.expected);
    });
  }
});

describe("isClosedLikeMiss — after 계열/closed 의 KRX-only 폴백 창", () => {
  it("after · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("after", null, false)).toBe(true);
  });
  it("after_close · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("after_close", null, false)).toBe(true);
  });
  it("closed · live=null · !failed → true", () => {
    expect(isClosedLikeMiss("closed", null, false)).toBe(true);
  });
  it("pre · live=null → false (isPreMarketReset 이 처리)", () => {
    expect(isClosedLikeMiss("pre", null, false)).toBe(false);
  });
  it("preopen · live=null → false (isPreMarketReset 이 처리)", () => {
    expect(isClosedLikeMiss("preopen", null, false)).toBe(false);
  });
  it("regular · live=null → false", () => {
    expect(isClosedLikeMiss("regular", null, false)).toBe(false);
  });
  it("after · live 있음 → false (live NXT 값 사용)", () => {
    expect(isClosedLikeMiss("after", q(), false)).toBe(false);
  });
  it("after · live=null · failed=true → false (KIS 실패는 별도 배지, 폴백 아님)", () => {
    expect(isClosedLikeMiss("after", null, true)).toBe(false);
  });
  it("undefined → false", () => {
    expect(isClosedLikeMiss(undefined, null, false)).toBe(false);
  });
});

// 두 술어가 상호 배타적이어야 표시 분기(preReset / closedLike)가 안전하다.
// 두 술어 모두 세션 집합이 서로 겹치지 않으므로, 서버 세션이 클라 시계와 어긋난
// 조합(폴링이 멈춘 구간의 stale 응답) 까지 포함해 시각 전 범위를 훑는다.
// preReset 은 컴포넌트와 같은 tabSession 축으로 호출한다 — 응답 없는 축이 끼어들어도
// 배타성이 유지되는지가 폴백의 안전 조건이다.
describe("두 술어의 상호 배타성", () => {
  const SESSIONS: (KrxSession | undefined)[] = [
    "regular", "after", "after_close", "pre", "preopen", "closed", undefined,
  ];
  const NOWS: Date[] = [
    t(7, 30), t(8, 20), t(8, 55), t(10, 0), t(16, 0), t(21, 0),
    kst(2026, 7, 25, 10, 0), // 토요일
    kst(2026, 1, 1, 8, 30), // 휴장일 · 창 시각
  ];
  const LIVES: (StockQuote | null)[] = [null, q()];
  const MARKETS: QuoteMarket[] = ["krx", "nxt"];

  for (const s of SESSIONS) {
    for (const market of MARKETS) {
      for (const live of LIVES) {
        it(`${s ?? "undefined"} · ${market} · live=${live === null ? "null" : "quote"} → 어느 시각에도 동시 true 없음`, () => {
          for (const now of NOWS) {
            const pre = isPreMarketReset(tabSession(s, now), market, now);
            const closed = isClosedLikeMiss(s, live, false);
            expect(pre && closed).toBe(false);
          }
        });
      }
    }
  }
});
