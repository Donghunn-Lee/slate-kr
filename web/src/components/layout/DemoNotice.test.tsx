// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/domSetup";
import { DemoNotice } from "./DemoNotice";

type User = ReturnType<typeof userEvent.setup>;

const STORAGE_KEY = "slatekr_demo_notice";

const queryNotice = () => screen.queryByRole("region", { name: "가상 시세 데모" });

// jsdom 은 문서 이동을 구현하지 않는다 — 링크 클릭의 기본 동작만 막고 닫기 처리는 그대로 본다.
const preventNavigation = (e: MouseEvent) => e.preventDefault();

const CLOSE_PATHS: ReadonlyArray<[string, (user: User) => Promise<void>]> = [
  ["확인", (user) => user.click(screen.getByRole("button", { name: "확인" }))],
  ["자세히", (user) => user.click(screen.getByRole("link", { name: "자세히" }))],
];

describe("DemoNotice", () => {
  beforeEach(() => {
    localStorage.clear();
    document.addEventListener("click", preventNavigation);
  });

  afterEach(() => {
    document.removeEventListener("click", preventNavigation);
    vi.restoreAllMocks();
  });

  it("저장소가 비어 있으면 열린다", () => {
    render(<DemoNotice />);

    expect(queryNotice()).toBeInTheDocument();
    expect(queryNotice()).toHaveTextContent("가상 데이터입니다");
  });

  it('"v1" 이 기록돼 있으면 열리지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, "v1");
    render(<DemoNotice />);

    expect(queryNotice()).not.toBeInTheDocument();
  });

  it.each(CLOSE_PATHS)("%s 로 닫으면 v1 을 기록한다", async (_, close) => {
    const user = userEvent.setup();
    render(<DemoNotice />);

    await close(user);

    expect(queryNotice()).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("v1");
  });

  it("열려도 포커스를 가져가지 않는다", () => {
    render(<DemoNotice />);

    expect(queryNotice()).toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it("페이지를 조작해도 닫히지 않고 기록하지 않는다", async () => {
    const user = userEvent.setup();
    const onPageClick = vi.fn();
    render(
      <>
        <button type="button" onClick={onPageClick}>
          페이지 버튼
        </button>
        <DemoNotice />
      </>
    );

    await user.click(screen.getByRole("button", { name: "페이지 버튼" }));
    await user.keyboard("{Escape}");

    expect(onPageClick).toHaveBeenCalledOnce();
    expect(queryNotice()).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("저장소 접근이 throw 해도 열리고, 닫기는 throw 없이 이번 화면에서만 닫힌다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<DemoNotice />);
    expect(queryNotice()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "확인" }));

    expect(queryNotice()).not.toBeInTheDocument();
  });
});
