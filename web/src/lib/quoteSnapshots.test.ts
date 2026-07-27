import { describe, it, expect } from "vitest";
import {
  decideMultiSnapshot,
  decideSingleSnapshot,
  isSnapshotSession,
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
    });
  });

  it("비NXT (nx_eligible=false) → null (isNxtMiss 배지 경로 유지)", () => {
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
    expect(q).toBeNull();
  });

  it("sign: change<0 → down", () => {
    expect(snapshotToQuote(mkRow({ un_change: -100 }))?.sign).toBe("down");
  });

  it("sign: change=0 → flat", () => {
    expect(snapshotToQuote(mkRow({ un_change: 0 }))?.sign).toBe("flat");
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

describe("decideSingleSnapshot", () => {
  const row = mkRow({});

  it("라이브 세션 → fallback (스냅샷 무시)", () => {
    expect(decideSingleSnapshot("regular", row, true)).toEqual({ kind: "fallback" });
    expect(decideSingleSnapshot("after", row, true)).toEqual({ kind: "fallback" });
  });

  it("대상 세션 + date 캡처 실패(0 rows) → fallback (기존 KIS 경로)", () => {
    expect(decideSingleSnapshot("after_close", undefined, false)).toEqual({
      kind: "fallback",
    });
  });

  it("대상 세션 + row hit(NXT) → serve quote (OHL=0)", () => {
    const d = decideSingleSnapshot("after_close", row, true);
    expect(d.kind).toBe("serve");
    if (d.kind !== "serve") throw new Error();
    expect(d.quote?.price).toBe(255000);
    expect(d.quote?.open).toBe(0);
  });

  it("대상 세션 + row hit(비NXT) → serve null (라이브 없음 계약)", () => {
    const d = decideSingleSnapshot(
      "closed",
      mkRow({ nx_eligible: false }),
      true,
    );
    expect(d).toEqual({ kind: "serve", quote: null });
  });

  it("대상 세션 + 부분 miss (row 없지만 date 존재) → serve null", () => {
    expect(decideSingleSnapshot("preopen", undefined, true)).toEqual({
      kind: "serve",
      quote: null,
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

  it("대상 세션 + hit/miss 혼합 → 각 티커별 serve (NXT=quote, 비NXT=null, miss=null)", () => {
    const d = decideMultiSnapshot(
      "after_close",
      ["005930", "035720", "999999"],
      { "005930": nxtRow, "035720": nonRow },
      true,
    );
    expect(d.kind).toBe("serve");
    if (d.kind !== "serve") throw new Error();
    expect(d.byTicker["005930"]?.price).toBe(255000);
    expect(d.byTicker["035720"]).toBeNull();
    expect(d.byTicker["999999"]).toBeNull();
  });

  it("빈 tickers → serve 빈 dict (dateExists=false 여도 fallback)", () => {
    // 빈 요청은 route 상단에서 short-circuit 되므로 여기까지 오지 않지만 방어.
    expect(decideMultiSnapshot("after_close", [], {}, false)).toEqual({
      kind: "fallback",
    });
  });
});
