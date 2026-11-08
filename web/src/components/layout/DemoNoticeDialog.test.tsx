// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/domSetup";
import { DemoNoticeDialog } from "./DemoNoticeDialog";

type User = ReturnType<typeof userEvent.setup>;

const STORAGE_KEY = "slatekr_demo_notice";

const queryDialog = () => screen.queryByRole("dialog", { name: "가상 시세 데모입니다" });

// jsdom 은 문서 이동을 구현하지 않는다 — 링크 클릭의 기본 동작만 막고 닫기 처리는 그대로 본다.
const preventNavigation = (e: MouseEvent) => e.preventDefault();

const CLOSE_PATHS: ReadonlyArray<[string, (user: User) => Promise<void>]> = [
  ["확인", (user) => user.click(screen.getByRole("button", { name: "확인" }))],
  ["닫기(X)", (user) => user.click(screen.getByRole("button", { name: "닫기" }))],
  ["ESC", (user) => user.keyboard("{Escape}")],
  ["자세히 보기", (user) => user.click(screen.getByRole("link", { name: "자세히 보기" }))],
];

describe("DemoNoticeDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    document.addEventListener("click", preventNavigation);
  });

  afterEach(() => {
    document.removeEventListener("click", preventNavigation);
    vi.restoreAllMocks();
  });

  it("저장소가 비어 있으면 열린다", () => {
    render(<DemoNoticeDialog />);

    expect(queryDialog()).toBeInTheDocument();
  });

  it('"v1" 이 기록돼 있으면 열리지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, "v1");
    render(<DemoNoticeDialog />);

    expect(queryDialog()).not.toBeInTheDocument();
  });

  it.each(CLOSE_PATHS)("%s 로 닫으면 v1 을 기록한다", async (_, close) => {
    const user = userEvent.setup();
    render(<DemoNoticeDialog />);

    await close(user);

    expect(queryDialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("v1");
  });

  it("저장소 접근이 throw 해도 열리고, 닫기는 throw 없이 이번 화면에서만 닫힌다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<DemoNoticeDialog />);
    expect(queryDialog()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "확인" }));

    expect(queryDialog()).not.toBeInTheDocument();
  });
});
