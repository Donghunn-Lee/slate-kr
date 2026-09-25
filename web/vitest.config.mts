import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    // 차트 모듈이 shared/fonts 를 거쳐 next/font/google 을 임포트한다 — 빌드 변환 없이도 로드되게 stub 으로 대체.
    alias: {
      "next/font/google": fileURLToPath(new URL("./src/test/nextFontGoogle.ts", import.meta.url)),
    },
    // lib/db.ts가 모듈 로드 시점에 neon(process.env.DATABASE_URL!)을 호출한다.
    // 순수함수 테스트가 lib 파일을 임포트만 해도 초기화가 트리거되므로 더미 URL 주입 — 실제 쿼리는 발생하지 않는다.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
