import { describe, it, expect } from "vitest";
import { getTickSize } from "./get-tick-size";
import {
  DEMO_ANCHOR_DATE,
  generateDailyBars,
  generateIntradayBars,
  getDailyBar,
  getTickerProfile,
  listTradingDates,
  marketReturnDaily,
  quoteAt,
  type DemoDailyBar,
  type DemoMinuteBar,
  type TickerProfile,
} from "./demo-price-model";

const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
const minuteOf = (bar: DemoMinuteBar): number => (bar.timestamp % 86_400) / 60;
const hhmm = (h: number, m: number): number => h * 60 + m;
const isTickMultiple = (p: number): boolean => p % getTickSize(p) === 0;

const EPS_ANCHOR = { eps: 5_000, bps: 40_000 };
const PINS = [
  { date: "2023-12-31", price: 52_300 },
  { date: "2024-12-31", price: 61_800 },
  { date: "2025-12-31", price: 58_000 },
];
// 핀이 있는 종목 · 사다리 종목 · 재무 없는 종목이 섞이도록
const SAMPLE: { ticker: string; profile: TickerProfile }[] = [
  { ticker: "000001", profile: getTickerProfile("000001", EPS_ANCHOR) },
  { ticker: "000002", profile: getTickerProfile("000002", { ...EPS_ANCHOR, pins: PINS }) },
  { ticker: "000003", profile: getTickerProfile("000003", { eps: null, bps: null }) },
  { ticker: "000004", profile: getTickerProfile("000004", { eps: -120, bps: 900 }) },
];
const findByNx = (nx: boolean): { ticker: string; profile: TickerProfile } => {
  for (let i = 1; i < 200; i++) {
    const ticker = String(100_000 + i);
    const profile = getTickerProfile(ticker, EPS_ANCHOR);
    if (profile.nxEligible === nx) return { ticker, profile };
  }
  throw new Error("unreachable");
};
const NXT = findByNx(true);
const KRX_ONLY = findByNx(false);

// 2026-11-10(화) — 앵커 이후 첫 번째 꽉 찬 주, 휴장일 없음
const TODAY = "2026-11-10";
const PREV = "2026-11-09";

const dayBars = (ticker: string, profile: TickerProfile): [DemoDailyBar, DemoDailyBar] => {
  const [prev, today] = generateDailyBars(ticker, profile, PREV, TODAY);
  return [prev, today];
};

describe("1. 결정론", () => {
  it("같은 입력 2회 → deep equal, 다른 ticker → 다름", () => {
    const a = getTickerProfile("005930", EPS_ANCHOR);
    const b = getTickerProfile("005930", EPS_ANCHOR);
    expect(a).toEqual(b);
    expect(generateDailyBars("005930", a, "2026-01-02", "2026-03-31")).toEqual(
      generateDailyBars("005930", b, "2026-01-02", "2026-03-31"),
    );
    const other = getTickerProfile("000660", EPS_ANCHOR);
    expect(generateDailyBars("000660", other, "2026-01-02", "2026-03-31")).not.toEqual(
      generateDailyBars("005930", a, "2026-01-02", "2026-03-31"),
    );
    const [prev, today] = dayBars("005930", a);
    expect(generateIntradayBars("005930", a, TODAY, prev, today, "UN")).toEqual(
      generateIntradayBars("005930", a, TODAY, prev, today, "UN"),
    );
  });
});

describe("2. 이력 불변", () => {
  it.each(SAMPLE)("$ticker: to 를 늘려도 기존 행이 같다", ({ ticker, profile }) => {
    const short = generateDailyBars(ticker, profile, "2024-01-02", DEMO_ANCHOR_DATE);
    const long = generateDailyBars(ticker, profile, "2024-01-02", "2026-12-31");
    expect(long.slice(0, short.length)).toEqual(short);
    // from 을 당겨도 겹치는 행은 같다
    const earlier = generateDailyBars(ticker, profile, "2023-06-01", "2026-12-31");
    expect(earlier.slice(earlier.length - long.length)).toEqual(long);
  });
});

describe("3. 앵커", () => {
  it.each(SAMPLE)("$ticker: 앵커 날 regularClose === anchorPrice", ({ ticker, profile }) => {
    expect(getDailyBar(ticker, profile, DEMO_ANCHOR_DATE).regularClose).toBe(profile.anchorPrice);
  });

  it("EPS 양수 종목의 anchorPrice / EPS ∈ [5, 40] (틱 반올림 여유)", () => {
    for (let i = 0; i < 50; i++) {
      const profile = getTickerProfile(String(200_000 + i), EPS_ANCHOR);
      const per = profile.anchorPrice / EPS_ANCHOR.eps;
      expect(per).toBeGreaterThanOrEqual(5);
      expect(per).toBeLessThanOrEqual(40 + getTickSize(profile.anchorPrice) / EPS_ANCHOR.eps);
    }
  });

  it("핀 종목의 핀 날 regularClose 는 핀 가격", () => {
    const { ticker, profile } = SAMPLE[1];
    expect(profile.pins.map((p) => p.date)).toEqual(["2023-12-29", "2024-12-30", "2025-12-30"]);
    for (const pin of profile.pins) {
      expect(getDailyBar(ticker, profile, pin.date).regularClose).toBe(pin.price);
    }
  });
});

describe("11. 평균회귀", () => {
  // OU 없이는 small tier 의 200일 뒤 ln(R/핀) 표준편차가 ≈ 0.45 — 핀으로 잡은 수준이 2배·절반까지 흩어진다
  it("small tier 핀 종목 200개: 마지막 핀 200거래일 뒤 ln(R/핀) 표본 표준편차 < 0.30", () => {
    const pin = { date: "2025-12-31", price: 20_000 };
    const samples: number[] = [];
    for (let i = 0; samples.length < 200; i++) {
      const ticker = String(300_000 + i);
      const profile = getTickerProfile(ticker, { ...EPS_ANCHOR, pins: [pin] });
      if (profile.tier !== "small") continue;
      const pinDate = profile.pins[0].date;
      const target = listTradingDates(pinDate, "2026-12-31").slice(1)[199];
      samples.push(Math.log(getDailyBar(ticker, profile, target).regularClose / profile.pins[0].price));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, x) => a + (x - mean) ** 2, 0) / (samples.length - 1));
    expect(sd).toBeLessThan(0.3);
  });
});

describe("4. 시장 규칙", () => {
  it.each(SAMPLE)("$ticker: 고저 포함 · 상하한 · 틱 · 거래량", ({ ticker, profile }) => {
    const bars = generateDailyBars(ticker, profile, "2024-01-02", "2026-12-31");
    expect(bars.length).toBeGreaterThan(700);
    for (const b of bars) {
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close, b.regularClose));
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close, b.regularClose));
      const base = b.basePrice as number;
      expect(b.close).toBeGreaterThanOrEqual(base * 0.7);
      expect(b.close).toBeLessThanOrEqual(base * 1.3);
      expect(b.regularClose).toBeGreaterThanOrEqual(base * 0.7);
      expect(b.regularClose).toBeLessThanOrEqual(base * 1.3);
      for (const p of [b.open, b.high, b.low, b.close, b.regularClose]) {
        expect(isTickMultiple(p)).toBe(true);
      }
      expect(b.volume).toBeGreaterThan(0);
    }
  });

  it("basePrice = 전일 regularClose", () => {
    const bars = generateDailyBars("000001", SAMPLE[0].profile, "2026-10-01", "2026-11-30");
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].basePrice).toBe(bars[i - 1].regularClose);
    }
  });
});

describe("5. 정합 — 분봉 집계 = 일봉", () => {
  it.each([NXT, KRX_ONLY])("$ticker (nx=$profile.nxEligible)", ({ ticker, profile }) => {
    const [prev, today] = dayBars(ticker, profile);
    const bars = generateIntradayBars(ticker, profile, TODAY, prev, today, "UN") as DemoMinuteBar[];
    expect(bars[0].open).toBe(today.open);
    expect(Math.max(...bars.map((b) => b.high))).toBe(today.high);
    expect(Math.min(...bars.map((b) => b.low))).toBe(today.low);
    expect(bars[bars.length - 1].close).toBe(today.close);
    expect(minuteOf(bars[bars.length - 1])).toBe(hhmm(20, 0));
    expect(bars.reduce((s, b) => s + b.volume, 0)).toBe(today.volume);
    const atClose = bars.find((b) => minuteOf(b) === hhmm(15, 30)) as DemoMinuteBar;
    expect(atClose.close).toBe(today.regularClose);
    for (const b of bars) {
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      for (const p of [b.open, b.high, b.low, b.close]) expect(isTickMultiple(p)).toBe(true);
    }
    // 봉 사이 연속 — 다음 봉 시가 = 직전 종가
    for (let i = 1; i < bars.length; i++) expect(bars[i].open).toBe(bars[i - 1].close);
  });
});

describe("6. 세션 창", () => {
  it("비NXT: 08:xx · 15:31~15:59 없음, 09:00 시작 · 16:00 재개", () => {
    const [prev, today] = dayBars(KRX_ONLY.ticker, KRX_ONLY.profile);
    const bars = generateIntradayBars(KRX_ONLY.ticker, KRX_ONLY.profile, TODAY, prev, today, "UN") as DemoMinuteBar[];
    const minutes = bars.map(minuteOf);
    expect(minutes[0]).toBe(hhmm(9, 0));
    expect(minutes.some((m) => m < hhmm(9, 0))).toBe(false);
    expect(minutes.some((m) => m > hhmm(15, 30) && m < hhmm(16, 0))).toBe(false);
    expect(minutes).toContain(hhmm(16, 0));
    expect(bars).toHaveLength(391 + 241);
  });

  it("NXT: 08:00 시작, 15:31 부터 애프터 연속", () => {
    const [prev, today] = dayBars(NXT.ticker, NXT.profile);
    const bars = generateIntradayBars(NXT.ticker, NXT.profile, TODAY, prev, today, "UN") as DemoMinuteBar[];
    const minutes = bars.map(minuteOf);
    expect(minutes[0]).toBe(hhmm(8, 0));
    expect(minutes).toContain(hhmm(15, 45));
    expect(bars).toHaveLength(60 + 391 + 270);
    const j = generateIntradayBars(NXT.ticker, NXT.profile, TODAY, prev, today, "J") as DemoMinuteBar[];
    expect(minuteOf(j[0])).toBe(hhmm(9, 0));
    expect(j[0].open).toBe(today.open);
  });

  it("NX & !nxEligible → null", () => {
    const [prev, today] = dayBars(KRX_ONLY.ticker, KRX_ONLY.profile);
    expect(generateIntradayBars(KRX_ONLY.ticker, KRX_ONLY.profile, TODAY, prev, today, "NX")).toBeNull();
    expect(quoteAt(KRX_ONLY.ticker, KRX_ONLY.profile, kst(TODAY, "1030"), "NX")).toBeNull();
  });
});

describe("7. quoteAt", () => {
  it.each([NXT, KRX_ONLY])("$ticker: 10:30 장중 — 분봉의 지금까지", ({ ticker, profile }) => {
    const [prev, today] = dayBars(ticker, profile);
    const bars = generateIntradayBars(ticker, profile, TODAY, prev, today, "UN") as DemoMinuteBar[];
    const upTo = bars.filter((b) => minuteOf(b) <= hhmm(10, 30));
    const q = quoteAt(ticker, profile, kst(TODAY, "1030"), "UN");
    expect(q).not.toBeNull();
    const quote = q as NonNullable<typeof q>;
    expect(quote.price).toBe(upTo[upTo.length - 1].close);
    expect(quote.change).toBe(quote.price - prev.regularClose);
    expect(quote.change).toBe(quote.price - (today.basePrice as number));
    expect(quote.volume).toBe(upTo.reduce((s, b) => s + b.volume, 0));
    expect(quote.open).toBe(today.open);
    expect(quote.high).toBe(Math.max(...upTo.map((b) => b.high)));
    expect(quote.low).toBe(Math.min(...upTo.map((b) => b.low)));
    const next = quoteAt(ticker, profile, kst(TODAY, "1031"), "UN") as NonNullable<typeof q>;
    expect(next.price).toBe((bars.find((b) => minuteOf(b) === hhmm(10, 31)) as DemoMinuteBar).close);
  });

  it("주말 → 금요일 20:00 종가 고정, 등락은 금요일 기준가 대비", () => {
    const { ticker, profile } = NXT;
    const [thu, fri] = generateDailyBars(ticker, profile, "2026-11-12", "2026-11-13");
    const sat = quoteAt(ticker, profile, kst("2026-11-14", "1200"), "UN") as NonNullable<ReturnType<typeof quoteAt>>;
    expect(sat.price).toBe(fri.close);
    expect(sat.change).toBe(fri.close - thu.regularClose);
    expect(sat.volume).toBe(fri.volume);
    expect(sat.high).toBe(fri.high);
    expect(sat.low).toBe(fri.low);
    const sun = quoteAt(ticker, profile, kst("2026-11-15", "2300"), "UN");
    expect(sun).toEqual(sat);
    const afterClose = quoteAt(ticker, profile, kst("2026-11-13", "2130"), "UN");
    expect(afterClose).toEqual(sat);
  });

  it("비NXT 개장 전(08:30) — 전일 20:00 종가 + OHL 0", () => {
    const { ticker, profile } = KRX_ONLY;
    const [prev] = dayBars(ticker, profile);
    const q = quoteAt(ticker, profile, kst(TODAY, "0830"), "UN") as NonNullable<ReturnType<typeof quoteAt>>;
    expect(q.price).toBe(prev.close);
    expect(q.change).toBe(prev.close - prev.regularClose);
    expect(q.open).toBe(0);
    expect(q.volume).toBe(0);
  });
});

describe("9. 1-팩터", () => {
  // m > 1% 인 날은 9일 중 하루꼴 — 60일 창엔 서너 날뿐이라 18개월 창으로 표본을 늘린다
  it("m(d) > 1% 인 날 상승 종목 비율 > 65% (200 종목 × 18개월)", () => {
    const dates = listTradingDates("2025-01-02", "2026-06-30");
    expect(dates.length).toBeGreaterThanOrEqual(350);
    const strongDays = dates.filter((d) => marketReturnDaily("KRX", d) > 0.01);
    expect(strongDays.length).toBeGreaterThanOrEqual(20);
    let up = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const ticker = String(300_000 + i);
      const profile = getTickerProfile(ticker, EPS_ANCHOR);
      const bars = generateDailyBars(ticker, profile, dates[0], dates[dates.length - 1]);
      const byDate = new Map(bars.map((b) => [b.date, b]));
      for (const d of strongDays) {
        const b = byDate.get(d) as DemoDailyBar;
        total += 1;
        if (b.regularClose > (b.basePrice as number)) up += 1;
      }
    }
    expect(up / total).toBeGreaterThan(0.65);
  });
});

describe("10. 성능", () => {
  it("2,700 ticker × quoteAt(14:00) < 1,000ms", () => {
    const universe = Array.from({ length: 2700 }, (_, i) => {
      const ticker = String(400_000 + i);
      return { ticker, profile: getTickerProfile(ticker, { eps: 100 + (i % 50) * 400, bps: null }) };
    });
    const now = kst(TODAY, "1400");
    const t0 = performance.now();
    let checksum = 0;
    for (const { ticker, profile } of universe) {
      const q = quoteAt(ticker, profile, now, "UN");
      checksum += (q as NonNullable<typeof q>).price;
    }
    const elapsed = performance.now() - t0;
    expect(checksum).toBeGreaterThan(0);
    console.info(`B4-10 quoteAt × 2700: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(1000);
  });
});
