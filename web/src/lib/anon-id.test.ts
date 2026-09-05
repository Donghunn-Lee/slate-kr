import { describe, it, expect } from "vitest";
import { buildAnonCookieOptions } from "./anon-id";

describe("buildAnonCookieOptions", () => {
  it("locks path, sameSite, maxAge to fixed values regardless of env", () => {
    const opts = buildAnonCookieOptions(false, true);
    expect(opts.path).toBe("/");
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBe(60 * 60 * 24 * 365);
  });

  it("sets secure=true only in production", () => {
    expect(buildAnonCookieOptions(true, true).secure).toBe(true);
    expect(buildAnonCookieOptions(false, true).secure).toBe(false);
  });

  it("carries the httpOnly argument through", () => {
    expect(buildAnonCookieOptions(true, true).httpOnly).toBe(true);
    expect(buildAnonCookieOptions(true, false).httpOnly).toBe(false);
  });
});
