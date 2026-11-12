import { describe, it, expect } from "vitest";
import { CHART_THEME } from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";
import {
  barDirection,
  computeSma,
  computeSmaLast,
  generateWhitespace,
  mapBar,
  mapVolume,
} from "./chartSeriesData";

const bar = (time: string | number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});

const candle = (time: string | number, open: number, close: number): ChartBar => ({
  time,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
});

const colors = (c: string) => ({ color: c, wickColor: c, borderColor: c });

describe("computeSma", () => {
  it("period 미만 길이는 빈 배열", () => {
    expect(computeSma([bar(1, 10), bar(2, 20)], 3)).toEqual([]);
  });

  it("i >= period-1 자리부터 직전 period 개 평균", () => {
    // 길이 4 · period 3 → 점 2개 (index 2, 3)
    const bars = [bar(1, 10), bar(2, 20), bar(3, 30), bar(4, 40)];
    expect(computeSma(bars, 3)).toEqual([
      { time: 3, value: 20 },
      { time: 4, value: 30 },
    ]);
  });
});

describe("computeSmaLast", () => {
  it("전체 계산의 마지막 점과 같다", () => {
    const bars = [bar(1, 10), bar(2, 20), bar(3, 30), bar(4, 40)];
    expect(computeSmaLast(bars, 3)).toEqual(computeSma(bars, 3).at(-1));
  });

  it("period 미만 길이는 null", () => {
    expect(computeSmaLast([bar(1, 10)], 2)).toBeNull();
  });
});

describe("generateWhitespace", () => {
  it("숫자 time 은 UTCTimestamp 로 되짚는다", () => {
    const bars = [bar(100, 1), bar(160, 1), bar(220, 1)];
    expect(generateWhitespace(bars, 2)).toEqual([{ time: -20 }, { time: 40 }]);
  });

  it("문자열 time 은 일수로 환산해 되짚고 YYYY-MM-DD 로 되돌린다", () => {
    // 월 경계 (03-01 → 02-28 · 02-27) 를 넘는 되짚기
    const bars = [bar("2026-03-01", 1), bar("2026-03-02", 1), bar("2026-03-03", 1)];
    expect(generateWhitespace(bars, 2)).toEqual([{ time: "2026-02-27" }, { time: "2026-02-28" }]);
  });

  it("count<=0 또는 봉 2개 미만은 빈 배열", () => {
    expect(generateWhitespace([bar(1, 1), bar(2, 1)], 0)).toEqual([]);
    expect(generateWhitespace([bar(1, 1)], 3)).toEqual([]);
  });
});

describe("barDirection", () => {
  it("종가가 시가보다 크면 up, 작으면 down, 같으면 flat", () => {
    expect(barDirection(candle(1, 100, 101))).toBe("up");
    expect(barDirection(candle(1, 101, 100))).toBe("down");
    // 고저가 벌어진 도지 — 고저는 판정에 쓰지 않는다
    expect(barDirection({ time: 1, open: 100, high: 105, low: 95, close: 100 })).toBe("flat");
  });
});

// dimBefore=200 기준 — time 100 은 dim 구간, 300 은 그 밖
describe("mapBar", () => {
  const palette = CHART_THEME.light;

  it("dim 밖 up · down 봉은 색 필드 없이 시리즈 기본색에 맡긴다", () => {
    expect(mapBar(candle(300, 10, 11), palette, 200)).toStrictEqual({
      time: 300,
      open: 10,
      high: 11,
      low: 10,
      close: 11,
    });
    expect(mapBar(candle(300, 11, 10), palette, 200)).toStrictEqual({
      time: 300,
      open: 11,
      high: 11,
      low: 10,
      close: 10,
    });
  });

  it("dim 밖 시가=종가 봉은 몸통·심지·테두리 모두 neutralLine", () => {
    expect(mapBar(candle(300, 10, 10), palette, 200)).toMatchObject(colors(palette.neutralLine));
  });

  it("dim 구간 봉은 방향별 dim 색, 시가=종가는 dim.flat", () => {
    expect(mapBar(candle(100, 10, 11), palette, 200)).toMatchObject(colors(palette.dim.up));
    expect(mapBar(candle(100, 11, 10), palette, 200)).toMatchObject(colors(palette.dim.down));
    expect(mapBar(candle(100, 10, 10), palette, 200)).toMatchObject(colors(palette.dim.flat));
  });

  it("문자열 time(일봉)은 dim 을 적용하지 않고 시가=종가면 neutralLine", () => {
    expect(mapBar(candle("2026-11-06", 10, 10), palette, 200)).toMatchObject(
      colors(palette.neutralLine)
    );
  });
});

describe("mapVolume", () => {
  const palette = CHART_THEME.light;

  it("봉 방향별 volume 색, 시가=종가는 volume.flat", () => {
    expect(mapVolume({ ...candle(1, 10, 11), volume: 5 }, palette)?.color).toBe(palette.volume.up);
    expect(mapVolume({ ...candle(1, 11, 10), volume: 5 }, palette)?.color).toBe(
      palette.volume.down
    );
    expect(mapVolume({ ...candle(1, 10, 10), volume: 5 }, palette)?.color).toBe(
      palette.volume.flat
    );
  });

  it("volume 없는 봉은 null", () => {
    expect(mapVolume(candle(1, 10, 11), palette)).toBeNull();
  });
});
