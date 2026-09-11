import { describe, it, expect } from "vitest";
import { buildMinuteSlots, densifyIntradayBars } from "./densifyIntradayBars";
import { kstToFakeUtcSec } from "./kis-quote-fetch";
import { isDomesticSessionGapFill } from "@/shared/utils/intradaySentinel";
import type { ChartBar } from "@/shared/types/quote";

const DAY = "20260911";
const PREV = "20260910";
const sec = (hhmm: string, date: string = DAY): number =>
  kstToFakeUtcSec(date, `${hhmm}00`);
const bar = (
  hhmm: string,
  close: number,
  over: Partial<ChartBar> = {},
): ChartBar => ({
  time: sec(hhmm),
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 10,
  ...over,
});
const isGapSlot = (hhmmss: string) => isDomesticSessionGapFill(hhmmss, 0);
const noExclusion = () => false;

describe("buildMinuteSlots", () => {
  it("[start, end] 양끝 포함 · 60초 간격", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0903"), noExclusion);
    expect(slots).toEqual([sec("0900"), sec("0901"), sec("0902"), sec("0903")]);
  });

  it("start > end → [] (슬롯 창 시작 전)", () => {
    expect(buildMinuteSlots(sec("0900"), sec("0859"), noExclusion)).toEqual([]);
  });

  it("갭 창 술어(isDomesticSessionGapFill) 통과 슬롯 제외 — 08:50~08:59 · 15:20~15:29 · 15:31~15:39", () => {
    const slots = buildMinuteSlots(sec("0800"), sec("2000"), isGapSlot);
    const hhmm = (t: number) => {
      const d = new Date(t * 1000);
      return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
    };
    const labels = slots.map(hhmm);
    // 08:00~20:00 = 721분 − 갭 29분
    expect(slots).toHaveLength(721 - 29);
    expect(labels).toContain("0849");
    expect(labels).not.toContain("0850");
    expect(labels).not.toContain("0859");
    expect(labels).toContain("0900");
    expect(labels).toContain("1519");
    expect(labels).not.toContain("1520");
    expect(labels).not.toContain("1529");
    // 15:30 마감 단일가 실체결 분은 갭 창 밖
    expect(labels).toContain("1530");
    expect(labels).not.toContain("1531");
    expect(labels).not.toContain("1539");
    expect(labels).toContain("1540");
  });
});

describe("densifyIntradayBars", () => {
  it("빈 슬롯 → 실봉 그대로", () => {
    const bars = [bar("0900", 100), bar("0905", 101)];
    expect(densifyIntradayBars(bars, [])).toEqual(bars);
  });

  it("sparse → dense: 봉 수 = 슬롯 수 (첫 슬롯에 실봉 존재)", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0905"), noExclusion);
    const bars = [bar("0900", 100), bar("0903", 103), bar("0905", 105)];
    const out = densifyIntradayBars(bars, slots);
    expect(out).toHaveLength(slots.length);
    expect(out.map((b) => b.time)).toEqual(slots);
  });

  it("fill 봉 = O=H=L=C=직전 종가 · vol 0", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0903"), noExclusion);
    const bars = [bar("0900", 100), bar("0903", 103)];
    const out = densifyIntradayBars(bars, slots);
    expect(out[1]).toEqual({
      time: sec("0901"),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 0,
    });
    expect(out[2]).toMatchObject({ time: sec("0902"), close: 100, volume: 0 });
    // 실봉은 원본 그대로
    expect(out[0]).toBe(bars[0]);
    expect(out[3]).toBe(bars[1]);
  });

  it("마지막 체결 이후 현재 분까지 fill (슬롯 끝 = 현재 분)", () => {
    // 10:26 마지막 체결 · 10:46 조회 → 10:27~10:46 이 10:26 종가로 채워진다
    const slots = buildMinuteSlots(sec("1000"), sec("1046"), noExclusion);
    const bars = [bar("1000", 4080), bar("1026", 4095)];
    const out = densifyIntradayBars(bars, slots);
    expect(out).toHaveLength(47);
    const tail = out.slice(-20);
    expect(tail.every((b) => b.close === 4095 && b.volume === 0)).toBe(true);
    expect(out[out.length - 1].time).toBe(sec("1046"));
  });

  it("첫 슬롯 이전 봉이 없으면 앞쪽 슬롯은 채우지 않는다 (직전 종가 부재)", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0905"), noExclusion);
    const bars = [bar("0903", 103)];
    const out = densifyIntradayBars(bars, slots);
    expect(out.map((b) => b.time)).toEqual([sec("0903"), sec("0904"), sec("0905")]);
  });

  it("전일 tail 이 앞에 있으면 첫 체결 전 슬롯을 전일 마지막 종가로 채운다", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0902"), noExclusion);
    const prev = bar("1530", 250, { time: sec("1530", PREV) });
    const bars = [prev, bar("0902", 255)];
    const out = densifyIntradayBars(bars, slots);
    expect(out.map((b) => b.time)).toEqual([
      sec("1530", PREV),
      sec("0900"),
      sec("0901"),
      sec("0902"),
    ]);
    // 슬롯 밖 전일 봉은 그대로 통과 — 전일 분은 채우지 않는다
    expect(out[0]).toBe(prev);
    expect(out[1]).toMatchObject({ close: 250, volume: 0 });
    expect(out[2]).toMatchObject({ close: 250, volume: 0 });
  });

  it("갭 창 슬롯은 건너뛴다 — 15:19 다음이 15:30", () => {
    const slots = buildMinuteSlots(sec("1518"), sec("1530"), isGapSlot);
    const bars = [bar("1518", 100), bar("1530", 102)];
    const out = densifyIntradayBars(bars, slots);
    expect(out.map((b) => b.time)).toEqual([sec("1518"), sec("1519"), sec("1530")]);
    expect(out[1]).toMatchObject({ close: 100, volume: 0 });
  });

  it("슬롯 밖 실봉은 보존한다 — 슬롯은 채움 대상만 정한다", () => {
    // 갭 창 안 실체결(15:25 vol>0) 은 술어가 통과시키므로 슬롯엔 없어도 봉은 남아야 한다
    const slots = buildMinuteSlots(sec("1518"), sec("1530"), isGapSlot);
    const bars = [bar("1518", 100), bar("1525", 101), bar("1530", 102)];
    const out = densifyIntradayBars(bars, slots);
    expect(out.map((b) => b.time)).toEqual([
      sec("1518"),
      sec("1519"),
      sec("1525"),
      sec("1530"),
    ]);
  });

  it("마지막 슬롯 이후 실봉도 보존한다", () => {
    const slots = buildMinuteSlots(sec("0900"), sec("0901"), noExclusion);
    const bars = [bar("0900", 100), bar("0903", 103)];
    const out = densifyIntradayBars(bars, slots);
    expect(out.map((b) => b.time)).toEqual([sec("0900"), sec("0901"), sec("0903")]);
  });
});
