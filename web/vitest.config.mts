import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    // db.ts는 모듈 로드 시 neon(process.env.DATABASE_URL!)을 호출한다.
    // computeTtmEps 등 순수함수 테스트가 lib/ 모듈 임포트만으로 실패하지 않도록
    // 더미 URL 주입. 실제 쿼리는 호출되지 않음.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
