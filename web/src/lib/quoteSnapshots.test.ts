import { describe, it, expect } from "vitest";
import {
  decideMultiSnapshot,
  decideSingleSnapshot,
  getSnapshotLookupDate,
  isSnapshotSession,
  snapshotToNxQuote,
  snapshotToQuote,
} from "./quoteSnapshots";

// row shape 은 lib 내부 타입이지만 테스트에서 부분 shape 으로 넘겨도 함수는 필드
// 참조만 하므로 안전. as any 지양 위해 최소 필드로 helper 구성.
type Row = Parameters<typeof snapshotToQuote>[0];

const mkRow = (o: Partial<Row>): Row => ({
  ticker: "005930",
  date: new Date("2026-07-27"),
  un_close: 255000,
  un_change: 5500,
  un_change_rate: 2.2,
  un_volume: 34_401_475,
  un_value: 8_671_123_718_750,
  nx_eligible: true,
  nx_close: 255000,
  nx_volume: 11_105_431,
  ...o,
});

describe("snapshotToQuote", () => {
  it("NXT (nx_eligible=true) → StockQuote 반환 (OHL=0)", () => {
    const q = snapshotToQuote(mkRow({}));
    expect(q).toEqual({
      ticker: "005930",
      price: 255000,
      change: 5500,
      changeRate: 2.2,
      sign: "up",
      open: 0,
      high: 0,
      low: 0,
      volume: 34_401_475,
      source: "un",
    });
  });

  it("source 는 un 고정 (UN 축 변환)", () => {
    expect(snapshotToQuote(mkRow({})).source).toBe("un");
    expect(snapshotToQuote(mkRow({ un_change: -100 })).source).toBe("un");
  });

  // KRX 애프터마켓은 전 종목 대상이라 비NXT 의 un_close 도 20:00 애프터 종가 — nx_eligible 은
  // 서빙 게이트가 아니다.
  it("비NXT (nx_eligible=false) → un_* 축 StockQuote 반환", () => {
    const q = snapshotToQuote(mkRow({
      ticker: "035720",
      un_close: 37050,
      un_change: 850,
      un_change_rate: 2.35,
      un_volume: 1_800_149,
      nx_eligible: false,
      nx_close: null,
      nx_volume: null,
    }));
    expect(q).toEqual({
      ticker: "035720",
      price: 37050,
      change: 850,
      changeRate: 2.35,
      sign: "up",
      open: 0,
      high: 0,
      low: 0,
      volume: 1_800_149,
      source: "un",
    });
  });

  it("sign: change<0 → down", () => {
    expect(snapshotToQuote(mkRow({ un_change: -100 })).sign).toBe("down");
  });

  it("sign: change=0 → flat", () => {
    expect(snapshotToQuote(mkRow({ un_change: 0 })).sign).toBe("flat");
  });
});

// NX 축: nx_change 컬럼이 없어 전일 종가(un_close − un_change) 대비로 재산출.
describe("snapshotToNxQuote", () => {
  it("NXT + nx_close 有 → nx 축 StockQuote (change 는 전일 종가 대비 재산출)", () => {
    // 실측 9/15: UN 최종 체결 250,500(KRX 애프터) vs NX 종가 250,000. 전일 종가 245,000.
    const q = snapshotToNxQuote(mkRow({
      un_close: 250500,
      un_change: 5500,
      un_change_rate: 2.24,
      nx_close: 250000,
      nx_volume: 11_105_431,
    }));
    expect(q).toEqual({
      ticker: "005930",
      price: 250000,
      change: 5000,
      changeRate: (5000 / 245000) * 100,
      sign: "up",
      open: 0,
      high: 0,
      low: 0,
      volume: 11_105_431,
      source: "nx",
    });
  });

  it("sign: NX 종가 < 전일 종가 → down, = → flat", () => {
    expect(snapshotToNxQuote(mkRow({ nx_close: 249000 }))?.sign).toBe("down");
    expect(snapshotToNxQuote(mkRow({ nx_close: 249500 }))?.sign).toBe("flat");
  });

  it("비NXT (nx_eligible=false) → null", () => {
    expect(
      snapshotToNxQuote(mkRow({ nx_eligible: false, nx_close: null, nx_volume: null })),
    ).toBeNull();
  });

  it("NXT 인데 nx_close null → null (UN 축 폴백은 호출측)", () => {
    expect(snapshotToNxQuote(mkRow({ nx_close: null }))).toBeNull();
  });
});

describe("isSnapshotSession", () => {
  it("after_close / closed / preopen 만 true", () => {
    expect(isSnapshotSession("after_close")).toBe(true);
    expect(isSnapshotSession("closed")).toBe(true);
    expect(isSnapshotSession("preopen")).toBe(true);
  });
  it("라이브 세션(regular/after/pre) 은 false", () => {
    expect(isSnapshotSession("regular")).toBe(false);
    expect(isSnapshotSession("after")).toBe(false);
    expect(isSnapshotSession("pre")).toBe(false);
  });
  it("undefined 도 false (초기 로드)", () => {
    expect(isSnapshotSession(undefined)).toBe(false);
  });
});

// KST = UTC+9.
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 조회 키는 마지막 마감일 축 — 응답 date 가 쓰는 거래일 축과 갈라져도 캡처본을 따라간다.
describe("getSnapshotLookupDate", () => {
  it("20:30 after_close → 오늘 (당일 20:10 캡처본)", () => {
    expect(getSnapshotLookupDate(kst(2026, 7, 23, 20, 30))).toBe("2026-07-23");
  });
  it("02:00 after_close(자정 넘김) → 직전 거래일", () => {
    expect(getSnapshotLookupDate(kst(2026, 7, 24, 2, 0))).toBe("2026-07-23");
  });
  it("07:00 · 08:55 preopen → 직전 거래일 (오늘 캡처본 아직 없음)", () => {
    expect(getSnapshotLookupDate(kst(2026, 7, 23, 7, 0))).toBe("2026-07-22");
    expect(getSnapshotLookupDate(kst(2026, 7, 23, 8, 55))).toBe("2026-07-22");
  });
  it("토요일 closed → 직전 거래일", () => {
    expect(getSnapshotLookupDate(kst(2026, 7, 25, 10, 0))).toBe("2026-07-24");
  });
});

describe("decideSingleSnapshot", () => {
  const row = mkRow({});

  it("라이브 세션 → fallback (스냅샷 무시)", () => {
    expect(decideSingleSnapshot("regular", row, true, null)).toEqual({ kind: "fallback" });
    expect(decideSingleSnapshot("after", row, true, null)).toEqual({ kind: "fallback" });
    expect(decideSingleSnapshot("after", row, true, "nxt")).toEqual({ kind: "fallback" });
  });

  it("대상 세션 + date 캡처 실패(0 rows) → fallback (기존 KIS 경로)", () => {
    expect(decideSingleSnapshot("after_close", undefined, false, null)).toEqual({
      kind: "fallback",
    });
    expect(decideSingleSnapshot("after_close", undefined, false, "nxt")).toEqual({
      kind: "fallback",
    });
  });

  it("대상 세션 + row hit(NXT) → serve quote (OHL=0)", () => {
    const d = decideSingleSnapshot("after_close", row, true, null);
    expect(d.kind).toBe("serve");
    if (d.kind !== "serve") throw new Error();
    expect(d.quote?.price).toBe(255000);
    expect(d.quote?.open).toBe(0);
  });

  it("대상 세션 + row hit(비NXT) → serve quote (NXT 와 같은 un_* 축)", () => {
    const d = decideSingleSnapshot(
      "closed",
      mkRow({ nx_eligible: false }),
      true,
      null,
    );
    expect(d.kind).toBe("serve");
    if (d.kind !== "serve") throw new Error();
    expect(d.quote?.price).toBe(255000);
    expect(d.quote?.source).toBe("un");
  });

  it("대상 세션 + 부분 miss (row 없지만 date 존재) → serve null", () => {
    expect(decideSingleSnapshot("preopen", undefined, true, null)).toEqual({
      kind: "serve",
      quote: null,
    });
    expect(decideSingleSnapshot("preopen", undefined, true, "nxt")).toEqual({
      kind: "serve",
      quote: null,
    });
  });

  // market=nxt: UN 최종 체결이 KRX 애프터 쪽이면 un_close ≠ nx_close — NXT 탭은 NX 축.
  describe("market=nxt", () => {
    const divergedRow = mkRow({ un_close: 250500, un_change: 5500, nx_close: 250000 });

    it("NXT + nx_close 有 → nx 축 serve (price=nx_close, source=nx)", () => {
      const d = decideSingleSnapshot("after_close", divergedRow, true, "nxt");
      expect(d.kind).toBe("serve");
      if (d.kind !== "serve") throw new Error();
      expect(d.quote?.price).toBe(250000);
      expect(d.quote?.change).toBe(5000);
      expect(d.quote?.volume).toBe(11_105_431);
      expect(d.quote?.source).toBe("nx");
    });

    it("krx / 미지정 은 같은 row 라도 UN 축 유지", () => {
      for (const market of ["krx", null] as const) {
        const d = decideSingleSnapshot("after_close", divergedRow, true, market);
        if (d.kind !== "serve") throw new Error();
        expect(d.quote?.price).toBe(250500);
        expect(d.quote?.source).toBe("un");
      }
    });

    it("NXT 인데 nx_close null → UN 축 폴백", () => {
      const d = decideSingleSnapshot(
        "closed",
        mkRow({ un_close: 250500, nx_close: null }),
        true,
        "nxt",
      );
      if (d.kind !== "serve") throw new Error();
      expect(d.quote?.price).toBe(250500);
      expect(d.quote?.source).toBe("un");
    });

    it("비NXT (nx_eligible=false) → UN 축 (종전과 동일)", () => {
      const d = decideSingleSnapshot(
        "preopen",
        mkRow({ nx_eligible: false, nx_close: null, nx_volume: null }),
        true,
        "nxt",
      );
      if (d.kind !== "serve") throw new Error();
      expect(d.quote?.price).toBe(255000);
      expect(d.quote?.source).toBe("un");
    });
  });
});

describe("decideMultiSnapshot", () => {
  const nxtRow = mkRow({ ticker: "005930" });
  const nonRow = mkRow({ ticker: "035720", nx_eligible: false });

  it("라이브 세션 → fallback", () => {
    expect(
      decideMultiSnapshot("regular", ["005930"], { "005930": nxtRow }, true),
    ).toEqual({ kind: "fallback" });
  });

  it("대상 세션 + date 캡처 실패 → fallback", () => {
    expect(decideMultiSnapshot("after_close", ["005930"], {}, false)).toEqual({
      kind: "fallback",
    });
  });

  it("대상 세션 + hit/miss 혼합 → 각 티커별 serve (NXT=quote, 비NXT=quote, miss=null)", () => {
    const d = decideMultiSnapshot(
      "after_close",
      ["005930", "035720", "999999"],
      { "005930": nxtRow, "035720": nonRow },
      true,
    );
    expect(d.kind).toBe("serve");
    if (d.kind !== "serve") throw new Error();
    expect(d.byTicker["005930"]?.price).toBe(255000);
    expect(d.byTicker["035720"]?.price).toBe(255000);
    expect(d.byTicker["999999"]).toBeNull();
  });

  it("빈 tickers → serve 빈 dict (dateExists=false 여도 fallback)", () => {
    // 빈 요청은 route 상단에서 short-circuit 되므로 여기까지 오지 않지만 방어.
    expect(decideMultiSnapshot("after_close", [], {}, false)).toEqual({
      kind: "fallback",
    });
  });
});
