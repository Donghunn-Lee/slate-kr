import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseUrl } from "./base-url";

describe("getBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the explicit base URL over the Vercel domain", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://slate.example");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "slate-kr.vercel.app");
    expect(getBaseUrl()).toBe("https://slate.example");
  });

  it("prefixes https to the Vercel production host when no explicit URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "slate-kr.vercel.app");
    expect(getBaseUrl()).toBe("https://slate-kr.vercel.app");
  });

  it("falls back to localhost when neither is set", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});
