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
  source: "krx",
  ...over,
});

const KST_TODAY = "2026-08-26";
const PREV_DATE = "2026-08-25";
const UPDATED_AT = "12:34:56";
// KST 분. NXT 탭 15:20·15:40 경계 케이스만 값을 바꾼다.
const min = (h: number, m = 0): number => h * 60 + m;

const nxt = (over: Partial<HeaderLabelInput> = {}): HeaderLabelInput => ({
  session: "regular",
  market: "nxt",
  live: q(),
  initialDate: KST_TODAY,
  kstToday: KST_TODAY,
  updatedAtText: UPDATED_AT,
  openingWindow: false,
  krxAfterMarketOpen: false,
  kstMinutes: min(12, 34),
  ...over,
});

const krx = (over: Partial<HeaderLabelInput> = {}): HeaderLabelInput => ({
  ...nxt(over),
  market: "krx",
  ...over,
});

// 미지정 경로 — 토글 없는 종목. 라이브 축은 NXT 탭과 같고 after 의 16:00 경계만 다르다.
const auto = (over: Partial<HeaderLabelInput> = {}): HeaderLabelInput => ({
  ...nxt(over),
  market: undefined,
  ...over,
});

// SSR 행 라벨 — 표시 값이 initialPrice 인 모든 경로의 공통 축.
const SSR_TODAY = { labelText: "애프터마켓 마감", timeText: "20:00" };
const SSR_PREV = { labelText: "전일 종가", timeText: "08.25" };

// ── NXT 탭 — 세션·live 전 조합 ──────────────────────────
describe("computeHeaderLabel · NXT 탭", () => {
  const cases: Array<{
    name: string;
    session: KrxSession;
    live: StockQuote | null;
    openingWindow?: boolean;
    kstMinutes?: number;
    label: string;
    time: string;
  }> = [
    { name: "regular · live 있음", session: "regular", live: q(), label: "정규장", time: UPDATED_AT },
    { name: "regular · live=null", session: "regular", live: null, label: "정규장", time: "" },
    { name: "after · live 있음 · 15:40 이후", session: "after", live: q(), kstMinutes: min(16), label: "애프터마켓", time: UPDATED_AT },
    { name: "after · live=null → SSR 행", session: "after", live: null, kstMinutes: min(16), label: SSR_TODAY.labelText, time: SSR_TODAY.timeText },
    { name: "after_close · live 있음", session: "after_close", live: q(), label: "애프터마켓 마감", time: "20:00" },
    { name: "after_close · live=null → SSR 행", session: "after_close", live: null, label: SSR_TODAY.labelText, time: SSR_TODAY.timeText },
    { name: "pre · live 있음", session: "pre", live: q(), openingWindow: true, label: "프리마켓", time: UPDATED_AT },
    { name: "pre · live=null → preReset", session: "pre", live: null, openingWindow: true, label: "개장전", time: "" },
    // 늦은 preopen(08:50~09:00) 은 08:50 프리마켓 종가가 있는 구간 — 값이 있으면 프리마켓 마감 축.
    { name: "늦은 preopen · live 있음", session: "preopen", live: q(), openingWindow: true, label: "프리마켓 마감", time: "08:50" },
    { name: "늦은 preopen · live=null", session: "preopen", live: null, openingWindow: true, label: "개장전", time: "" },
    // 이른 preopen(06:00~08:00) 은 리셋 창 밖 — 라이브는 스냅샷(20:00 NX 종가), 없으면 SSR 행.
    { name: "이른 preopen · live 있음", session: "preopen", live: q(), openingWindow: false, label: "애프터마켓 마감", time: "20:00" },
    { name: "이른 preopen · live=null → SSR 행", session: "preopen", live: null, openingWindow: false, label: SSR_TODAY.labelText, time: SSR_TODAY.timeText },
    { name: "closed · live 있음", session: "closed", live: q(), label: "애프터마켓 마감", time: "20:00" },
    { name: "closed · live=null → SSR 행", session: "closed", live: null, label: SSR_TODAY.labelText, time: SSR_TODAY.timeText },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = computeHeaderLabel(
        nxt({
          session: c.session,
          live: c.live,
          openingWindow: c.openingWindow ?? false,
          ...(c.kstMinutes !== undefined ? { kstMinutes: c.kstMinutes } : {}),
        }),
      );
      expect(r).toEqual({ labelText: c.label, timeText: c.time });
    });
  }
});

// live 가 없는 마감 계열은 closedLike 든 KIS 실패든 표시 값이 initialPrice — 라벨은 행 날짜만 본다.
// EOD 미적재 창(15:30~20:12) 은 행이 전일이라 "전일 종가", 적재 뒤엔 20:00 마감 캔들.
describe("computeHeaderLabel · NXT 탭 · 미지정 경로 · live=null 은 SSR 행 축", () => {
  const sessions: Array<{ session: KrxSession | undefined; openingWindow: boolean }> = [
    { session: "after", openingWindow: false },
    { session: "after_close", openingWindow: false },
    { session: "closed", openingWindow: false },
    { session: "preopen", openingWindow: false },
    { session: undefined, openingWindow: false },
  ];

  for (const mk of [nxt, auto]) {
    for (const s of sessions) {
      it(`${mk === nxt ? "NXT" : "미지정"} · ${s.session ?? "undefined"} · initialDate=today → 애프터마켓 마감 · 20:00`, () => {
        expect(computeHeaderLabel(mk({ ...s, live: null, initialDate: KST_TODAY }))).toEqual(SSR_TODAY);
      });
      it(`${mk === nxt ? "NXT" : "미지정"} · ${s.session ?? "undefined"} · initialDate<today → 전일 종가 · MM.DD`, () => {
        expect(computeHeaderLabel(mk({ ...s, live: null, initialDate: PREV_DATE }))).toEqual(SSR_PREV);
      });
      it(`${mk === nxt ? "NXT" : "미지정"} · ${s.session ?? "undefined"} · initialDate=null → 애프터마켓 마감 · ''`, () => {
        expect(computeHeaderLabel(mk({ ...s, live: null, initialDate: null }))).toEqual({
          labelText: "애프터마켓 마감",
          timeText: "",
        });
      });
    }
  }

  it("15:20·15:40·16:00 경계는 SSR 행 라벨에 닿지 않는다", () => {
    for (const mk of [nxt, auto]) {
      for (const m of [min(15, 25), min(15, 35), min(15, 50), min(16)]) {
        for (const open of [false, true]) {
          expect(
            computeHeaderLabel(
              mk({ session: "after", live: null, initialDate: PREV_DATE, kstMinutes: m, krxAfterMarketOpen: open }),
            ),
          ).toEqual(SSR_PREV);
        }
      }
    }
  });
});

// NXT 정규장은 15:20 에 닫히고 애프터마켓은 15:40 에 열린다 — 세션 경계(15:30) 양쪽 10분씩이
// 한 "정규장 마감" 라벨. 16:00 KRX 경계는 NXT 탭과 무관하다.
describe("computeHeaderLabel · NXT 탭 · 15:20 · 15:40 경계", () => {
  it("regular · 15:19 → '정규장' · updatedAtText", () => {
    expect(
      computeHeaderLabel(nxt({ session: "regular", live: q(), kstMinutes: min(15, 19) })),
    ).toEqual({ labelText: "정규장", timeText: UPDATED_AT });
  });

  it("regular · 15:20 → '정규장 마감' · '15:20'", () => {
    expect(
      computeHeaderLabel(nxt({ session: "regular", live: q(), kstMinutes: min(15, 20) })),
    ).toEqual({ labelText: "정규장 마감", timeText: "15:20" });
  });

  it("regular · 15:20 이후 · live=null → '정규장 마감' · '' (시각은 값이 있을 때만)", () => {
    expect(
      computeHeaderLabel(nxt({ session: "regular", live: null, kstMinutes: min(15, 25) })),
    ).toEqual({ labelText: "정규장 마감", timeText: "" });
  });

  it("after · 15:30~15:39 → '정규장 마감' · '15:20'", () => {
    for (const m of [min(15, 30), min(15, 39)]) {
      expect(
        computeHeaderLabel(nxt({ session: "after", live: q(), kstMinutes: m })),
      ).toEqual({ labelText: "정규장 마감", timeText: "15:20" });
    }
  });

  it("after · 15:40 → '애프터마켓' · updatedAtText", () => {
    expect(
      computeHeaderLabel(nxt({ session: "after", live: q(), kstMinutes: min(15, 40) })),
    ).toEqual({ labelText: "애프터마켓", timeText: UPDATED_AT });
  });

  it("after · 16:00 전 · krxAfterMarketOpen 무관 → '애프터마켓' (KRX 경계는 보지 않는다)", () => {
    for (const open of [false, true]) {
      expect(
        computeHeaderLabel(
          nxt({ session: "after", live: q(), kstMinutes: min(15, 50), krxAfterMarketOpen: open }),
        ),
      ).toEqual({ labelText: "애프터마켓", timeText: UPDATED_AT });
    }
  });
});

// ── 미지정 경로 ────────────────────────────────────────────
// 비NXT 종목의 after 라이브는 UN 통합가라 16:00 전엔 마감가 그대로 — KRX 탭과 같은 경계로
// 라벨만 가른다. 값은 컴포넌트가 live 를 그대로 쓴다.
describe("computeHeaderLabel · 미지정 경로", () => {
  it("after · live 있음 · 16:00 전 → '정규장 마감' · '15:30'", () => {
    expect(
      computeHeaderLabel(auto({ session: "after", live: q(), krxAfterMarketOpen: false })),
    ).toEqual({ labelText: "정규장 마감", timeText: "15:30" });
  });

  it("after · live 있음 · 16:00 이후 → '애프터마켓' · updatedAtText", () => {
    expect(
      computeHeaderLabel(auto({ session: "after", live: q(), krxAfterMarketOpen: true })),
    ).toEqual({ labelText: "애프터마켓", timeText: UPDATED_AT });
  });

  // NXT 15:20·15:40 경계는 NXT 탭 전용 — 비NXT 종목의 정규장은 15:30 까지다.
  it("regular · 15:20 이후 → '정규장' (NXT 경계 무관)", () => {
    expect(
      computeHeaderLabel(auto({ session: "regular", live: q(), kstMinutes: min(15, 25) })),
    ).toEqual({ labelText: "정규장", timeText: UPDATED_AT });
  });

  // 비NXT 종목은 프리마켓이 없어 늦은 preopen 은 개장전 축에 남는다.
  it("늦은 preopen · live 유무 무관 → '개장전' · ''", () => {
    for (const live of [q(), null]) {
      expect(
        computeHeaderLabel(auto({ session: "preopen", live, openingWindow: true })),
      ).toEqual({ labelText: "개장전", timeText: "" });
    }
  });

  // 이른 preopen 의 라이브는 UN 스냅샷(20:00 종가) — KRX 애프터마켓은 전 종목 대상이라 NXT 탭과 같은 축.
  it("이른 preopen · live 있음 → '애프터마켓 마감' · '20:00'", () => {
    expect(
      computeHeaderLabel(auto({ session: "preopen", live: q(), openingWindow: false })),
    ).toEqual({ labelText: "애프터마켓 마감", timeText: "20:00" });
  });

  it("after · 늦은 preopen 외 세션은 NXT 탭과 동일", () => {
    const sessions: KrxSession[] = ["regular", "after_close", "pre", "closed"];
    for (const session of sessions) {
      for (const live of [q(), null]) {
        for (const openingWindow of [false, true]) {
          const over = { session, live, openingWindow };
          expect(computeHeaderLabel(auto(over))).toEqual(computeHeaderLabel(nxt(over)));
        }
      }
    }
    for (const live of [q(), null]) {
      const over = { session: "preopen" as const, live, openingWindow: false };
      expect(computeHeaderLabel(auto(over))).toEqual(computeHeaderLabel(nxt(over)));
    }
  });
});

// ── KRX 탭 ──────────────────────────────────────────────
describe("computeHeaderLabel · KRX 탭", () => {
  it("regular · live 있음 → '정규장' · updatedAtText", () => {
    expect(computeHeaderLabel(krx({ session: "regular", live: q() }))).toEqual({
      labelText: "정규장",
      timeText: UPDATED_AT,
    });
  });

  it("regular · live=null → 라벨 유지 (실패 배지는 컴포넌트가 담당)", () => {
    expect(computeHeaderLabel(krx({ session: "regular", live: null }))).toEqual({
      labelText: "정규장",
      timeText: UPDATED_AT,
    });
  });

  // KRX 정규장은 15:30 까지 — NXT 15:20 경계는 KRX 탭에 닿지 않는다.
  it("regular · 15:20 이후 → '정규장' · updatedAtText", () => {
    expect(
      computeHeaderLabel(krx({ session: "regular", live: q(), kstMinutes: min(15, 25) })),
    ).toEqual({ labelText: "정규장", timeText: UPDATED_AT });
  });

  // 쿼리가 꺼진 KRX 탭의 표시 값은 daily_prices 행 = 20:00 마감 캔들 — 라벨도 그 축.
  it("비-regular · initialDate == today → '애프터마켓 마감' · '20:00'", () => {
    for (const s of ["after", "after_close", "pre", "preopen", "closed"] as const) {
      expect(
        computeHeaderLabel(krx({ session: s, live: null, initialDate: KST_TODAY })),
      ).toEqual(SSR_TODAY);
    }
  });

  it("비-regular · initialDate < today → '전일 종가' · 'MM.DD'", () => {
    for (const s of ["after", "after_close", "pre", "preopen", "closed"] as const) {
      expect(
        computeHeaderLabel(
          krx({ session: s, live: null, initialDate: PREV_DATE, kstToday: KST_TODAY }),
        ),
      ).toEqual(SSR_PREV);
    }
  });

  it("비-regular · initialDate=null → '애프터마켓 마감' · '' (경계)", () => {
    expect(
      computeHeaderLabel(krx({ session: "closed", live: null, initialDate: null })),
    ).toEqual({ labelText: "애프터마켓 마감", timeText: "" });
  });

  // after 세션의 KRX 탭은 J 채널이 15:30 부터 응답하므로 live 유무가 아니라 16:00 경계가
  // 라벨을 가른다. initialDate 는 EOD 적재(20:10) 전이라 전일로 남아 있는 게 보통이라
  // 라벨 축에서 빼야 값(오늘 라이브)·라벨이 어긋나지 않는다.
  it("after · live 있음 · 16:00 이후 → '애프터마켓' · updatedAtText (initialDate 무관)", () => {
    for (const initialDate of [KST_TODAY, PREV_DATE, null]) {
      expect(
        computeHeaderLabel(
          krx({ session: "after", live: q(), initialDate, krxAfterMarketOpen: true }),
        ),
      ).toEqual({ labelText: "애프터마켓", timeText: UPDATED_AT });
    }
  });

  it("after · live 있음 · 16:00 전 → '정규장 마감' · '15:30' (initialDate 무관)", () => {
    for (const initialDate of [KST_TODAY, PREV_DATE, null]) {
      expect(
        computeHeaderLabel(
          krx({ session: "after", live: q(), initialDate, krxAfterMarketOpen: false }),
        ),
      ).toEqual({ labelText: "정규장 마감", timeText: "15:30" });
    }
  });

  // 15:30~16:00 은 KRX 무체결 구간 — NXT 15:40 경계는 KRX 탭 라벨을 바꾸지 않는다.
  it("after · live 있음 · 15:40~16:00 → '정규장 마감' · '15:30' (NXT 경계 무관)", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: q(), kstMinutes: min(15, 50), krxAfterMarketOpen: false }),
      ),
    ).toEqual({ labelText: "정규장 마감", timeText: "15:30" });
  });

  it("after · live=null → initialDate 기준 (16:00 이후여도 라이브 없으면 SSR 표기)", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: null, initialDate: PREV_DATE, krxAfterMarketOpen: true }),
      ),
    ).toEqual(SSR_PREV);
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: null, initialDate: KST_TODAY, krxAfterMarketOpen: true }),
      ),
    ).toEqual(SSR_TODAY);
  });

  it("after_close · closed · live 있음 → '애프터마켓 마감' · '20:00' (NXT 탭과 동일 문구)", () => {
    for (const s of ["after_close", "closed"] as const) {
      for (const initialDate of [KST_TODAY, PREV_DATE, null]) {
        expect(
          computeHeaderLabel(krx({ session: s, live: q(), initialDate })),
        ).toEqual({ labelText: "애프터마켓 마감", timeText: "20:00" });
      }
    }
  });

  // 이른 preopen 의 KRX 탭 라이브는 지연 창 1회 fetch 뿐 — 라벨은 격상된 initialDate 축.
  it("이른 preopen · live 있음 · 창 밖 → initialDate 기준", () => {
    expect(
      computeHeaderLabel(krx({ session: "preopen", live: q(), initialDate: KST_TODAY })),
    ).toEqual(SSR_TODAY);
    expect(
      computeHeaderLabel(krx({ session: "preopen", live: q(), initialDate: PREV_DATE })),
    ).toEqual(SSR_PREV);
  });

  // 개장 전 창(08:00~09:00) — 값이 0 으로 리셋되는 구간이라 라벨도 "개장전" 축이어야 한다.
  // initialDate 가 어느 쪽이든(오늘 축 격상·전일 잔존) 창이 이긴다.
  it("개장 전 창 → '개장전' · '' (initialDate 무관)", () => {
    for (const s of ["pre", "preopen"] as const) {
      for (const initialDate of [KST_TODAY, PREV_DATE, null]) {
        expect(
          computeHeaderLabel(
            krx({ session: s, live: null, initialDate, openingWindow: true }),
          ),
        ).toEqual({ labelText: "개장전", timeText: "" });
      }
    }
  });

  it("개장 전 창 · 응답 없음(쿼리 비활성) → '개장전' · ''", () => {
    expect(
      computeHeaderLabel(
        krx({ session: undefined, live: null, initialDate: KST_TODAY, openingWindow: true }),
      ),
    ).toEqual({ labelText: "개장전", timeText: "" });
  });

  it("개장 전 창 · stale 응답 regular → '개장전' (창이 세션보다 앞선다)", () => {
    expect(
      computeHeaderLabel(krx({ session: "regular", live: q(), openingWindow: true })),
    ).toEqual({ labelText: "개장전", timeText: "" });
  });

  it("개장 전 창 · 지연 창 fetch 성공 → 값 0 과 같은 축의 '개장전' (값·라벨 일치)", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "pre", live: q(), initialDate: KST_TODAY, kstToday: KST_TODAY, openingWindow: true }),
      ),
    ).toEqual({ labelText: "개장전", timeText: "" });
  });

  // 지연 창(EOD 미적재 · initialDate < lastCloseDate) 흐름 — 호출측이 kstToday=lastCloseDate 축으로
  // 넘긴다. fetch 성공/실패는 initialDate 인자의 격상 여부로 함수에 전달됨.
  it("KRX 지연 창 · fetch 미시도/실패 (initialDate 뒤처짐) → 전일 종가", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: null, initialDate: PREV_DATE, kstToday: KST_TODAY }),
      ),
    ).toEqual(SSR_PREV);
  });

  it("KRX 지연 창 · after · fetch 성공 → 라이브 축 '정규장 마감 · 15:30' (16:00 전)", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after", live: q(), initialDate: KST_TODAY, kstToday: KST_TODAY }),
      ),
    ).toEqual({ labelText: "정규장 마감", timeText: "15:30" });
  });

  it("KRX 지연 창 · after_close · fetch 성공 → '애프터마켓 마감 · 20:00'", () => {
    expect(
      computeHeaderLabel(
        krx({ session: "after_close", live: q(), initialDate: KST_TODAY, kstToday: KST_TODAY }),
      ),
    ).toEqual({ labelText: "애프터마켓 마감", timeText: "20:00" });
  });
});
