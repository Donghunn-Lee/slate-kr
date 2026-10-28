import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals: false 라 Testing Library 가 전역 afterEach 를 찾지 못해 자동 cleanup 이 걸리지 않는다.
afterEach(cleanup);
