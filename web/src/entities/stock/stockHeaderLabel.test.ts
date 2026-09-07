import { describe, it, expect } from "vitest";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";
import { computeHeaderLabel, type HeaderLabelInput } from "./stockHeaderLabel";

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

const KST_TODAY = "2026-08-26";
const UPDATED_AT = "12:34:56";

const nxt = (over: Partial<HeaderLabelInput> = {}): HeaderLabelInput => ({
  session: "regular",
  market: "nxt",
  live: q(),
  isFailedQuote: false,
  initialDate: KST_TODAY,
  kstToday: KST_TODAY,
  updatedAtText: UPDATED_AT,
  openingWindow: false,
  ...over,
});

const krx = (over: Partial<HeaderLabelInput> = {}): HeaderLabelInput => ({
  ...nxt(over),
  market: "krx",
  ...over,
});

// ── NXT 탭 — 세션·live·failed 전 조합 ──────────────────────
describe("computeHeaderLabel · NXT 탭", () => {
  const cases: Array<{
    name: string;
    session: KrxSession;
    live: StockQuote | null;
    failed?: boolean;
    openingWindow?: boolean;
    label: string;
    time: string;
  }> = [
    { name: "regular · live 있음", session: "regular", live: q(), label: "장중", time: UPDATED_AT },
    { name: "regular · live=null · !failed", session: "regular", live: null, label: "장중", time: "" },
    { name: "regular · live=null · failed", session: "regular", live: null, failed: true, label: "장중", time: "" },
    { name: "after · live 있음", session: "after", live: q(), label: "애프터마켓", time: UPDATED_AT },
    { name: "after · live=null · !failed → closedLike", session: "after", live: null, label: "장 마감", time: "15:30" },
    { name: "after · live=null · failed", session: "after", live: null, failed: true, label: "애프터마켓", time: "" },
    { name: "after_close · live 있음", session: "after_close", live: q(), label: "애프터마켓 종가", time: "20:00" },
    { name: "after_close · live=null · !failed → closedLike", session: "after_close", live: null, label: "장 마감", time: "15:30" },
    { name: "after_close · live=null · failed", session: "after_close", live: null, failed: true, label: "애프터마켓 종가", time: "" },
    { name: "pre · live 있음", session: "pre", live: q(), openingWindow: true, label: "프리마켓", time: UPDATED_AT },
    { name: "pre · live=null → preReset", session: "pre", live: null, openingWindow: true, label: "개장 전", time: "" },
    { name: "늦은 preopen · live 있음", session: "preopen", live: q(), openingWindow: true, label: "개장 전", time: "" },
    { name: "늦은 preopen · live=null", session: "preopen", live: null, openingWindow: true, label: "개장 전", time: "" },
    // 이른 preopen(06:00~08:00) 은 리셋 창 밖이라 값이 전일 종가 그대로 — 라벨도 마감 계열로 낙하.
    { name: "이른 preopen · live 있음", session: "preopen", live: q(), openingWindow: false, label: "장 마감", time: "" },
    { name: "이른 preopen · live=null", session: "preopen", live: null, openingWindow: false, label: "장 마감", time: "" },
    { name: "closed · live 있음", session: "closed", live: q(), label: "애프터마켓 종가", time: "20:00" },
    { name: "closed · live=null · !failed → closedLike", session: "closed", live: null, label: "장 마감", time: "15:30" },
    // failed=true 는 closedLike 를 무너뜨려 세션 명시 라벨("애프터마켓 종가")로 흐른다.
    { name: "closed · live=null · failed", session: "closed", live: null, failed: true, label: "애프터마켓 종가", time: "15:30" },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = computeHeaderLabel(
        nxt({
          session: c.session,
          live: c.live,
          isFailedQuote: c.failed ?? false,
          openingWindow: c.openingWindow ?? false,
        }),
      );
      expect(r).toEqual({ labelText: c.label, timeText: c.time });
    });
  }
});

// ── KRX 탭 ──────────────────────────────────────────────
describe("computeHeaderLabel · KRX 탭", () => {
  it("regular · live 있음 → '장중' · updatedAtText", () => {
    expect(computeHeaderLabel(krx({ session: "regular", live: q() }))).toEqual({
      labelText: "장중",
      timeText: UPDATED_AT,
    });
  });

  it("regular · live=null · failed → 라벨 유지 (실패 배지는 컴포넌트가 담당)", () => {
    expect(
      computeHeaderLabel(krx({ session: "regular", live: null, isFailedQuote: true })),
    ).toEqual({ labelText: "장중", timeText: UPDATED_AT });
  });

  it("비-regular · initialDate == today → '장 마감' · '15:30'", () => {
    for (const s of ["after", "after_close", "pre", "preopen", "closed"] as const) {
      expect(
        computeHeaderLabel(krx({ session: s, live: null, initialDate: KST_TODAY })),
      ).toEqual({ labelText: "장 마감", timeText: "15:30" });
    }
  });

  it("비-regular · initialDate < today → '전일 종가' · 'MM.DD'", () => {
    for (const s of ["after", "after_close", "pre", "preopen", "closed"] as const) {
      expect(
        computeHeaderLabel(
          krx({ session: s, live: null, initialDate: "2026-08-25", kstToday: KST_TODAY }),
        ),
      ).toEqual({ labelText: "전일 종가", timeText: "08.25" });
    }
  });

  it("비-regular · initialDate=null → '장 마감' · '' (경계)", () => {
    expect(
      computeHeaderLabel(krx({ session: "closed", live: null, initialDate: null })),
    ).toEqual({ labelText: "장 마감", timeText: "" });
  });

  it("KRX 탭은 live 값과 무관하게 initialDate 기준 (비-regular)", () => {
    // 실사용에선 비-regular KRX 는 live=null 이지만, 함수 계약은 live 유무와 독립.
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: q(), initialDate: "2026-08-25", kstToday: KST_TODAY }),
      ),
    ).toEqual({ labelText: "전일 종가", timeText: "08.25" });
  });

  // 지연 창(EOD 미적재 · initialDate < lastCloseDate) 흐름 — 호출측이 kstToday=lastCloseDate 축으로
  // 넘긴다. fetch 성공/실패는 initialDate 인자의 격상 여부로 함수에 전달됨.
  it("KRX 지연 창 · fetch 미시도/실패 (initialDate 뒤처짐) → 전일 종가", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: null, initialDate: "2026-08-25", kstToday: KST_TODAY }),
      ),
    ).toEqual({ labelText: "전일 종가", timeText: "08.25" });
  });

  it("KRX 지연 창 · fetch 성공 (initialDate = lastCloseDate 로 격상) → 장 마감 · 15:30", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: q(), initialDate: KST_TODAY, kstToday: KST_TODAY }),
      ),
    ).toEqual({ labelText: "장 마감", timeText: "15:30" });
  });
});

// undefined session — 초기 로드 스켈레톤 게이트. NXT 탭에서만 발생 (KRX 는 initialDate 로 즉시).
describe("computeHeaderLabel · session=undefined (초기 로드)", () => {
  it("NXT 탭 · undefined → fallback '장 마감' · '' (else 최종)", () => {
    expect(computeHeaderLabel(nxt({ session: undefined, live: null }))).toEqual({
      labelText: "장 마감",
      timeText: "",
    });
  });
});
