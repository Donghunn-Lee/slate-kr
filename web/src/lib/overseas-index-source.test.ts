import { describe, it, expect } from "vitest";
import { generateIndexIntradayBars } from "@/lib/demo/index-model";
import {
  fetchOverseasIndexIntradayChart,
  fetchOverseasIndexQuote,
} from "./overseas-index-source";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

const minuteOf = (time: string | number): number => ((time as number) % 86_400) / 60;
const dateOf = (time: string | number): string =>
  new Date((time as number) * 1000).toISOString().slice(0, 10);
// 2026-11-10(화) — US · JP 모두 거래일
const TODAY = "2026-11-10";

describe("fetchOverseasIndexIntradayChart", () => {
  it(".DJI → null", async () => {
    expect(await fetchOverseasIndexIntradayChart(".DJI")).toBeNull();
  });

  it("SPX ET 11:00 → 전일 전체 + 오늘 11:00 까지, volume 없음", async () => {
    const bars = (await fetchOverseasIndexIntradayChart("SPX", new Date("2026-11-10T16:00:00Z"))) ?? [];
    const prev = bars.filter((b) => dateOf(b.time) === "2026-11-09");
    const today = bars.filter((b) => dateOf(b.time) === TODAY);
    expect(prev).toHaveLength(390);
    expect(minuteOf(today[0].time)).toBe(9 * 60 + 30);
    expect(minuteOf(today[today.length - 1].time)).toBe(11 * 60);
    expect(bars.every((b) => b.volume === undefined)).toBe(true);
    const full = generateIndexIntradayBars("SPX", TODAY) as IndexIntradaySnapshot[];
    expect(today[today.length - 1].close).toBe(full[today.length - 1].close);
  });

  it("NI225 JST 11:00 → 15분 지연이라 10:45 봉까지 · quote 가격 = 마지막 봉", async () => {
    const now = new Date("2026-11-10T02:00:00Z");
    const bars = (await fetchOverseasIndexIntradayChart("NI225", now)) ?? [];
    expect(minuteOf(bars[bars.length - 1].time)).toBe(10 * 60 + 45);
    const quote = await fetchOverseasIndexQuote("NI225", "니케이225");
    // 폴링 quote 는 실제 시각을 쓰므로 같은 시각의 생성기 값으로 대조한다.
    expect(quote?.name).toBe("니케이225");
    expect(quote?.price).toBeGreaterThan(0);
  });

  it("토요일(현지) → 금요일 전체만", async () => {
    const bars = (await fetchOverseasIndexIntradayChart("SPX", new Date("2026-11-14T18:00:00Z"))) ?? [];
    expect(bars.every((b) => dateOf(b.time) === "2026-11-13")).toBe(true);
    expect(bars).toHaveLength(390);
  });
});

describe("fetchOverseasIndexQuote", () => {
  it(".DJI 는 time null 로 값만 돌아온다", async () => {
    const quote = await fetchOverseasIndexQuote(".DJI", "다우존스");
    expect(quote?.time).toBeNull();
    expect(quote?.price).toBeGreaterThan(0);
  });
});
