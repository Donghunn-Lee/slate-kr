// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/domSetup";
import { DEMO_NOTICE_SEEN_SCRIPT } from "@/shared/constants/demoNotice";
import { DemoNotice } from "./DemoNotice";

type User = ReturnType<typeof userEvent.setup>;

const STORAGE_KEY = "slatekr_demo_notice";

const queryNotice = () => screen.queryByRole("region", { name: "가상 시세 데모" });

// jsdom 은 문서 이동을 구현하지 않는다 — 링크 클릭의 기본 동작만 막고 닫기 처리는 그대로 본다.
const preventNavigation = (e: MouseEvent) => e.preventDefault();

// jsdom 은 Tailwind 를 싣지 않아 sr-only 스팬이 inline 으로 계산되고, 이름 계산이 스팬 끝 공백을 잘라
// "안내자세히"로 붙인다 — 브라우저의 이름(공백 있음)과 둘 다 맞도록 공백을 선택으로 둔다.
const DETAIL_LINK_NAME = /^가상 데이터 안내 ?자세히$/;

const CLOSE_PATHS: ReadonlyArray<[string, (user: User) => Promise<void>]> = [
  ["확인", (user) => user.click(screen.getByRole("button", { name: "확인" }))],
  ["자세히", (user) => user.click(screen.getByRole("link", { name: DETAIL_LINK_NAME }))],
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

describe("DemoNotice hydration", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    container.remove();
    vi.restoreAllMocks();
  });

  const hydrate = async () => {
    const consoleError = vi.spyOn(console, "error");
    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <DemoNotice />, { onRecoverableError });
    });
    return { consoleError, onRecoverableError };
  };

  it("서버 HTML 에 카드가 있다", () => {
    container.innerHTML = renderToString(<DemoNotice />);

    expect(queryNotice()).toBeInTheDocument();
  });

  it("저장소가 비어 있으면 서버가 그린 카드를 그대로 이어받는다", async () => {
    container.innerHTML = renderToString(<DemoNotice />);
    const card = queryNotice();
    expect(card).toBeInTheDocument();

    const { consoleError, onRecoverableError } = await hydrate();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(queryNotice()).toBe(card);
  });

  it('"v1" 이 기록돼 있으면 어긋남 없이 hydration 한 뒤 카드를 지운다', async () => {
    container.innerHTML = renderToString(<DemoNotice />);
    localStorage.setItem(STORAGE_KEY, "v1");

    const { consoleError, onRecoverableError } = await hydrate();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(queryNotice()).not.toBeInTheDocument();
  });
});

describe("DEMO_NOTICE_SEEN_SCRIPT", () => {
  const SEEN_ATTR = "data-demo-notice-seen";

  const runScript = () => new Function(DEMO_NOTICE_SEEN_SCRIPT)();

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(SEEN_ATTR);
  });

  afterEach(() => {
    document.documentElement.removeAttribute(SEEN_ATTR);
    vi.restoreAllMocks();
  });

  it('"v1" 이 기록돼 있으면 <html> 에 속성을 붙인다', () => {
    localStorage.setItem(STORAGE_KEY, "v1");
    runScript();

    expect(document.documentElement).toHaveAttribute(SEEN_ATTR);
  });

  it.each([
    ["비어 있으면", null],
    ["다른 버전이면", "v0"],
  ])("저장소가 %s 붙이지 않는다", (_, stored) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEY, stored);
    runScript();

    expect(document.documentElement).not.toHaveAttribute(SEEN_ATTR);
  });

  it("저장소 접근이 throw 해도 예외 없이 붙이지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(runScript).not.toThrow();
    expect(document.documentElement).not.toHaveAttribute(SEEN_ATTR);
  });
});
