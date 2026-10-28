// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/test/domSetup";
import { useWatchlistStore } from "./store/useWatchlistStore";
import { WatchlistPageClient } from "./WatchlistPageClient";

// 목록이 비어 있으면 가격 · 공시 건수 · 시세 query 가 모두 꺼져 fetch 없이 렌더된다.
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WatchlistPageClient />
    </QueryClientProvider>
  );

describe("WatchlistPageClient 동기화 상태", () => {
  it("blocked · 서버 조회 실패 → '서버 저장 안 됨' 배지", () => {
    useWatchlistStore.setState({ syncStatus: "blocked" });
    renderPage();

    expect(screen.getByText("서버 저장 안 됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 관리" })).toBeEnabled();
  });

  it("loading · 첫 서버 조회 전 → 배지 없이 그룹 관리 disabled", () => {
    useWatchlistStore.setState({ syncStatus: "loading" });
    renderPage();

    expect(screen.queryByText("서버 저장 안 됨")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 관리" })).toBeDisabled();
  });
});
