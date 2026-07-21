import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import {
  isInvalidQuoteOhl,
  mergeLiveDayBar,
  type LiveQuoteForMerge,
} from "./mergeLiveDayBar";

const bar = (date: string, close: number, extra: Partial<ChartBar> = {}): ChartBar => ({
  time: date,
  open: close,
  high: close,
  low: close,
  close,
  ...extra,
});

const validQuote = (over: Partial<LiveQuoteForMerge> = {}): LiveQuoteForMerge => ({
  open: 100,
  high: 105,
  low: 95,
  price: 102,
  volume: 1_000,
  ...over,
});

describe("isInvalidQuoteOhl", () => {
  it("OHL 삼중 0 → true", () => {
    expect(isInvalidQuoteOhl({ open: 0, high: 0, low: 0 })).toBe(true);
  });

  it("OHL 중 하나라도 non-zero → false", () => {
    expect(isInvalidQuoteOhl({ open: 100, high: 0, low: 0 })).toBe(false);
    expect(isInvalidQuoteOhl({ open: 0, high: 100, low: 0 })).toBe(false);
    expect(isInvalidQuoteOhl({ open: 0, high: 0, low: 100 })).toBe(false);
  });

  it("정상 시세 → false", () => {
    expect(isInvalidQuoteOhl({ open: 100, high: 105, low: 95 })).toBe(false);
  });
});

describe("mergeLiveDayBar - 정상 quote", () => {
  const eod: ChartBar[] = [
    bar("2026-07-17", 700),
    bar("2026-07-18", 720, { volume: 5000 }),
  ];

  it("quote null → EOD 그대로", () => {
    expect(mergeLiveDayBar(eod, null, "2026-07-21")).toEqual(eod);
  });

  it("date undefined → EOD 그대로", () => {
    expect(mergeLiveDayBar(eod, validQuote(), undefined)).toEqual(eod);
  });

  it("새 날짜 append → 라이브 봉 추가", () => {
    const result = mergeLiveDayBar(eod, validQuote(), "2026-07-21");
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({
      time: "2026-07-21",
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1_000,
    });
  });

  it("EOD 마지막 date === live date → 기존 EOD 봉 replace", () => {
    const result = mergeLiveDayBar(eod, validQuote(), "2026-07-18");
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      time: "2026-07-18",
      open: 100,
      close: 102,
      volume: 1_000,
    });
  });

  it("replace 경로 · quote.volume undefined → EOD preservedVolume 유지", () => {
    const result = mergeLiveDayBar(
      eod,
      validQuote({ volume: undefined }),
      "2026-07-18",
    );
    expect(result[1].volume).toBe(5000);
  });
});

describe("mergeLiveDayBar - 무효 quote (OHL=0) 도지 게이트", () => {
  const eod: ChartBar[] = [
    bar("2026-07-17", 700),
    bar("2026-07-20", 749.64, { volume: 8000 }),
  ];

  const invalidQuote: LiveQuoteForMerge = {
    open: 0,
    high: 0,
    low: 0,
    price: 749.64, // KIS 가 preopen 에 prpr 로 반환하는 전일 종가
    volume: 0,
  };

  it("EOD 마지막 date === live date · 무효 quote → EOD 유지 (파괴 방지)", () => {
    // preopen 지수 시나리오: liveDate=어제, EOD 마지막이 어제.
    // 이전 버그: 무효 quote 의 OHL=0 이 어제 EOD 봉을 덮어써 0 낙하 발생.
    const result = mergeLiveDayBar(eod, invalidQuote, "2026-07-20");
    expect(result).toEqual(eod);
  });

  it("새 날짜 append · 무효 quote → 전일 종가 도지 봉 (O=H=L=C=prevClose)", () => {
    // pre/오늘 첫 병합 시나리오: liveDate=오늘, EOD 에 오늘 봉 없음, 아직 실가 없음.
    const result = mergeLiveDayBar(eod, invalidQuote, "2026-07-21");
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({
      time: "2026-07-21",
      open: 749.64,
      high: 749.64,
      low: 749.64,
      close: 749.64,
      volume: 0,
    });
  });

  it("새 날짜 append · 무효 quote · EOD 빈 배열 · quote.price 폴백", () => {
    const result = mergeLiveDayBar([], invalidQuote, "2026-07-21");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      time: "2026-07-21",
      open: 749.64,
      close: 749.64,
    });
  });

  it("새 날짜 append · 무효 quote · prevClose 0 → 합성 불가 → EOD 그대로", () => {
    const zeroQuote: LiveQuoteForMerge = {
      open: 0,
      high: 0,
      low: 0,
      price: 0,
      volume: 0,
    };
    expect(mergeLiveDayBar([], zeroQuote, "2026-07-21")).toEqual([]);
  });

  it("정상 quote 로 전환되면 그 시점부터 forming bar 로 replace", () => {
    // 프리 → 정규장 전환: 첫 라이브 quote 도착 시 도지가 실가로 교체되어야.
    const withDoji = mergeLiveDayBar(eod, invalidQuote, "2026-07-21");
    const withLive = mergeLiveDayBar(withDoji, validQuote({ price: 760 }), "2026-07-21");
    expect(withLive).toHaveLength(3);
    expect(withLive[2]).toMatchObject({
      time: "2026-07-21",
      open: 100,
      close: 760,
    });
  });
});
