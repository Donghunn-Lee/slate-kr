import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_FAULT_COOKIE, parseDemoFaultMode } from "@/shared/constants/demoFaultCookie";
import { applyDemoFault, DEMO_FAULT_DELAY_MS } from "./demo-fault";

const requestWith = (cookie?: string): NextRequest =>
  new NextRequest("http://localhost/api/prices", cookie ? { headers: { cookie } } : undefined);

describe("parseDemoFaultMode", () => {
  it.each(["delay", "fail"] as const)("%s → 그 모드", (raw) => {
    expect(parseDemoFaultMode(raw)).toBe(raw);
  });

  it.each([undefined, "", "normal", "DELAY"])("%s → null(정상)", (raw) => {
    expect(parseDemoFaultMode(raw)).toBeNull();
  });
});

describe("applyDemoFault", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delay → 3,000ms 가 지나야 resolve", async () => {
    let settled = false;
    const pending = applyDemoFault(requestWith(`${DEMO_FAULT_COOKIE}=delay`)).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(DEMO_FAULT_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await pending;
  });

  it("fail → injected failure 로 reject", async () => {
    await expect(applyDemoFault(requestWith(`${DEMO_FAULT_COOKIE}=fail`))).rejects.toThrow(
      "[demo-fault] injected failure"
    );
  });

  it.each([undefined, `${DEMO_FAULT_COOKIE}=normal`, "other=delay"])(
    "쿠키 %s → 타이머 없이 resolve",
    async (cookie) => {
      await expect(applyDemoFault(requestWith(cookie))).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
