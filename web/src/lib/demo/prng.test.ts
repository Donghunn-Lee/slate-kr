import { describe, it, expect } from "vitest";
import { createRng, gaussian, hashSeed, logUniform } from "./prng";

describe("hashSeed", () => {
  it("같은 입력 → 같은 시드, 부분 경계가 다르면 다른 시드", () => {
    expect(hashSeed("005930", "2026-11-03")).toBe(hashSeed("005930", "2026-11-03"));
    expect(hashSeed("005930", "2026-11-03")).not.toBe(hashSeed("005930", "2026-11-04"));
    expect(hashSeed("A", "B")).not.toBe(hashSeed("AB", ""));
  });
});

describe("createRng", () => {
  it("같은 시드 → 같은 수열, [0, 1) 범위", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("gaussian · logUniform", () => {
  // 1만 샘플이면 평균 ±0.05 · 표준편차 ±0.05 안에 들어온다
  it("gaussian 평균 ≈ 0 · 표준편차 ≈ 1", () => {
    const rng = createRng(7);
    const n = 10_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      sum += z;
      sq += z * z;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });

  it("logUniform 은 [min, max] 안이고 로그 중앙값이 기하평균 근처", () => {
    const rng = createRng(3);
    const values: number[] = [];
    for (let i = 0; i < 2000; i++) values.push(logUniform(rng, 100, 10_000));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(10_000);
    }
    const below = values.filter((v) => v < 1000).length / values.length;
    expect(Math.abs(below - 0.5)).toBeLessThan(0.05);
  });
});
