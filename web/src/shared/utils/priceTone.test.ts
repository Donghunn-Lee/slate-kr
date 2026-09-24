import { describe, it, expect } from "vitest";
import { priceToneClass } from "./priceTone";

describe("priceToneClass", () => {
  it("양수 → text-price-up", () => {
    expect(priceToneClass(0.01)).toBe("text-price-up");
  });

  it("음수 → text-price-down", () => {
    expect(priceToneClass(-120)).toBe("text-price-down");
  });

  it("0 → text-foreground", () => {
    expect(priceToneClass(0)).toBe("text-foreground");
  });

  it("-0 → text-foreground", () => {
    expect(priceToneClass(-0)).toBe("text-foreground");
  });

  it("null → text-foreground", () => {
    expect(priceToneClass(null)).toBe("text-foreground");
  });

  it("undefined → text-foreground", () => {
    expect(priceToneClass(undefined)).toBe("text-foreground");
  });

  it("NaN → text-foreground", () => {
    expect(priceToneClass(Number.NaN)).toBe("text-foreground");
  });

  it("PriceSign up/down/flat → 각 등락색 / foreground", () => {
    expect(priceToneClass("up")).toBe("text-price-up");
    expect(priceToneClass("down")).toBe("text-price-down");
    expect(priceToneClass("flat")).toBe("text-foreground");
  });
});
