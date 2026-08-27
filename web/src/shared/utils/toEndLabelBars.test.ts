import { describe, it, expect } from "vitest";
import { toEndLabelBars } from "./toEndLabelBars";
import type { ChartBar } from "@/shared/types/quote";

const Y = 2026;
const M = 7; // August (Date.UTC month index)
const D = 27;

// HHMMSS → fake-UTC epoch sec (KST wall-clock 를 UTC 로 위장).
const sec = (hhmmss: string): number =>
  Math.floor(
    Date.UTC(
      Y,
      M,
      D,
      Number(hhmmss.slice(0, 2)),
      Number(hhmmss.slice(2, 4)),
      Number(hhmmss.slice(4, 6)),
    ) / 1000,
  );

const bar = (
  hhmmss: string,
  ohlc: { o: number; h: number; l: number; c: number },
  v?: number,
): ChartBar => ({
  time: sec(hhmmss),
  open: ohlc.o,
  high: ohlc.h,
  low: ohlc.l,
  close: ohlc.c,
  ...(v !== undefined ? { volume: v } : {}),
});

const flat = (hhmmss: string, price: number, v?: number): ChartBar =>
  bar(hhmmss, { o: price, h: price, l: price, c: price }, v);

const CLOSE = "153000";

describe("toEndLabelBars", () => {
  it("빈 배열 → []", () => {
    expect(toEndLabelBars([], 60, CLOSE)).toEqual([]);
  });

  it("단일 봉 경계 — 09:00 개장 → 09:01 (1분 시프트, 클램프 없음)", () => {
    const result = toEndLabelBars([flat("090000", 100)], 60, CLOSE);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(sec("090100"));
  });

  it("단일 봉 경계 — 마감 봉 153000 → 153000 (클램프 유지)", () => {
    const result = toEndLabelBars([flat("153000", 100)], 60, CLOSE);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(sec("153000"));
  });

  it("단일 봉 경계 — 마감 후 154000 → 154100 (균일 시프트, 클램프 없음)", () => {
    const result = toEndLabelBars([flat("154000", 100)], 60, CLOSE);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(sec("154100"));
  });

  it("종목 1분 — [151900, 153000] → [152000, 153000] · 충돌 없음", () => {
    const input: ChartBar[] = [
      bar("151900", { o: 264, h: 265, l: 264, c: 265 }, 971),
      bar("153000", { o: 266, h: 266, l: 266, c: 266 }, 1058643),
    ];
    const result = toEndLabelBars(input, 60, CLOSE);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(sec("152000"));
    expect(result[0].close).toBe(265);
    expect(result[0].volume).toBe(971);
    expect(result[1].time).toBe(sec("153000"));
    expect(result[1].close).toBe(266);
    expect(result[1].volume).toBe(1058643);
  });

  it("지수 10분 — [151000, 152000(flat auction), 153000(cross)] → [152000, 153000 병합]", () => {
    // 152000(마감 auction · v=0 근방) + 153000(마감 크로스) 가 동일 shifted 153000 에 병합.
    const input: ChartBar[] = [
      bar("151000", { o: 6870, h: 6890, l: 6870, c: 6890 }, 7661),
      flat("152000", 6894.05, 200),
      bar("153000", { o: 6894.05, h: 6912.12, l: 6894.05, c: 6912.12 }, 6275),
    ];
    const result = toEndLabelBars(input, 600, CLOSE);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(sec("152000"));
    expect(result[0].open).toBe(6870);
    expect(result[0].close).toBe(6890);
    // 병합 봉
    expect(result[1].time).toBe(sec("153000"));
    expect(result[1].open).toBe(6894.05); // 선행 open
    expect(result[1].close).toBe(6912.12); // 후행 close
    expect(result[1].high).toBe(6912.12);
    expect(result[1].low).toBe(6894.05);
    expect(result[1].volume).toBe(200 + 6275);
  });

  it("지수 1분 마감 auction 전체 — [152000..152900, 153000] → 15:21~15:29 9봉 + 15:30 병합 1봉", () => {
    // 152000~152800 v=0 프리즈 (152000 은 v=200 이지만 동일 로직).
    // 152900 (마지막 auction 분) + 153000 (마감 크로스) → shifted 153000 에서 병합.
    const flatPrice = 6894.05;
    const auction: ChartBar[] = [
      flat("152000", flatPrice, 200),
      ...["152100", "152200", "152300", "152400", "152500", "152600", "152700", "152800"].map(
        (h) => flat(h, flatPrice, 0),
      ),
      flat("152900", flatPrice, 0),
    ];
    const cross = bar(
      "153000",
      { o: flatPrice, h: 6912.12, l: flatPrice, c: 6912.12 },
      6275,
    );
    const result = toEndLabelBars([...auction, cross], 60, CLOSE);
    expect(result).toHaveLength(10);
    const expectedFlatTimes = [
      "152100",
      "152200",
      "152300",
      "152400",
      "152500",
      "152600",
      "152700",
      "152800",
      "152900",
    ].map(sec);
    expect(result.slice(0, 9).map((b) => b.time)).toEqual(expectedFlatTimes);
    for (const b of result.slice(0, 9)) {
      expect(b.close).toBe(flatPrice);
    }
    // 15:30 병합 봉: 선행=152900(flat), 후행=153000(cross)
    const last = result[9];
    expect(last.time).toBe(sec("153000"));
    expect(last.open).toBe(flatPrice);
    expect(last.close).toBe(6912.12);
    expect(last.high).toBe(6912.12);
    expect(last.low).toBe(flatPrice);
    expect(last.volume).toBe(0 + 6275);
  });

  it("volume undefined 봉 — undefined 유지 (합산 대상 없음)", () => {
    const input: ChartBar[] = [
      { time: sec("100000"), open: 100, high: 100, low: 100, close: 100 },
    ];
    const result = toEndLabelBars(input, 60, CLOSE);
    expect(result[0].volume).toBeUndefined();
  });

  it("병합 시 한쪽만 volume → 정의된 값만 합산 (0 취급)", () => {
    const input: ChartBar[] = [
      { time: sec("152900"), open: 1, high: 1, low: 1, close: 1 },
      { time: sec("153000"), open: 2, high: 3, low: 2, close: 3, volume: 100 },
    ];
    const result = toEndLabelBars(input, 60, CLOSE);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(sec("153000"));
    expect(result[0].volume).toBe(100);
  });

  it("time 이 string 인 봉은 스킵 (typeof 가드)", () => {
    const input = [
      { time: "2026-08-27", open: 100, high: 100, low: 100, close: 100 } as ChartBar,
      flat("100000", 100, 5),
    ];
    const result = toEndLabelBars(input, 60, CLOSE);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(sec("100100"));
  });

  it("다일자 봉 — 각 봉이 자기 날짜의 close 기준으로 클램프", () => {
    // 전일 tail + 오늘 라이브 조합에서 각 날의 153000 이 별도 clamp 앵커.
    const prevClose = Math.floor(Date.UTC(Y, M, D - 1, 15, 30, 0) / 1000);
    const todayClose = sec("153000");
    const input: ChartBar[] = [
      {
        time: Math.floor(Date.UTC(Y, M, D - 1, 15, 30, 0) / 1000),
        open: 10,
        high: 10,
        low: 10,
        close: 10,
      },
      { time: todayClose, open: 20, high: 20, low: 20, close: 20 },
    ];
    const result = toEndLabelBars(input, 60, CLOSE);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(prevClose);
    expect(result[1].time).toBe(todayClose);
  });
});
