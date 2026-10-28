// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/domSetup";
import type { StockSearchResult } from "@/shared/types/stock";
import { SearchInput } from "./SearchInput";

const { push, results } = vi.hoisted(() => ({
  push: vi.fn(),
  results: [
    { ticker: "005930", name: "삼성전자", market: "KOSPI" },
    { ticker: "006400", name: "삼성SDI", market: "KOSPI" },
  ] satisfies StockSearchResult[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// debounce·요청 취소는 훅 소관 — 결과를 고정해 키보드 탐색만 본다.
vi.mock("./useStockSearch", () => ({
  useStockSearch: () => ({ results, isLoading: false, error: null }),
}));

const renderSearch = async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<SearchInput value="삼성" onChange={() => {}} onSelect={onSelect} />);
  const combobox = screen.getByRole("combobox");
  await user.click(combobox);
  return { user, combobox, onSelect };
};

describe("SearchInput 키보드 탐색", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("↓ · ↑ → 활성 옵션 이동, 마지막에서 멈추고 첫 옵션 위로 가면 해제", async () => {
    const { user, combobox } = await renderSearch();
    const options = screen.getAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(combobox).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(combobox).toHaveAttribute("aria-activedescendant", options[1].id);

    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(combobox).not.toHaveAttribute("aria-activedescendant");
  });

  it("활성 옵션에서 Enter → 그 종목 상세로 이동하고 목록 닫힘", async () => {
    const { user, onSelect } = await renderSearch();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith("006400", "삼성SDI");
    expect(push).toHaveBeenCalledWith("/stocks/006400");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("활성 옵션 없이 Enter → 검색 결과 페이지로 이동", async () => {
    const { user, onSelect } = await renderSearch();

    await user.keyboard("{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent("삼성")}`);
  });

  it("Escape → 목록 닫고 활성 해제, 이동 없음", async () => {
    const { user, combobox } = await renderSearch();

    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(combobox).not.toHaveAttribute("aria-activedescendant");
    expect(push).not.toHaveBeenCalled();
  });
});
