import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn — typography role merging", () => {
  it("Tailwind font-size class is superseded by later role class", () => {
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });

  it("Arbitrary size class is superseded by later role class", () => {
    expect(cn("text-[11px]", "text-micro")).toBe("text-micro");
  });

  it("Role class survives when combined with a text-color class", () => {
    const merged = cn("text-caption", "text-muted-foreground");
    expect(merged).toContain("text-caption");
    expect(merged).toContain("text-muted-foreground");
  });

  it("Role class survives when combined with an accent text-color class", () => {
    const merged = cn("text-micro", "text-sky-accent");
    expect(merged).toContain("text-micro");
    expect(merged).toContain("text-sky-accent");
  });
});
