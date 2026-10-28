// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/test/domSetup";
import { useWatchlistStore } from "./store/useWatchlistStore";
import { WatchlistButton } from "./WatchlistButton";

const renderButton = () =>
  render(<WatchlistButton ticker="005930" name="삼성전자" market="KOSPI" />);

describe("WatchlistButton 편집 비활성", () => {
  it("loading · 첫 서버 조회 전 → 관심 등록 disabled", () => {
    useWatchlistStore.setState({ syncStatus: "loading" });
    renderButton();

    expect(screen.getByRole("button", { name: "관심 등록" })).toBeDisabled();
  });

  it("synced · 서버 조회 성공 → 관심 등록 활성", () => {
    useWatchlistStore.setState({ syncStatus: "synced" });
    renderButton();

    expect(screen.getByRole("button", { name: "관심 등록" })).toBeEnabled();
  });
});
