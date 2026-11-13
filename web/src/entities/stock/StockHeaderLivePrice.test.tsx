// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ComponentProps } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/test/domSetup";
import { stockQuoteQueryKey, type StockQuoteResponse } from "@/features/stock-quote/useStockQuote";
import { StockHeaderLivePrice } from "./StockHeaderLivePrice";

// 2026-10-02 금요일 10:00 KST — 정규장이라 KRX 탭 조회가 켜져 있고, 응답이 없으면 스켈레톤 분기다.
const NOW = new Date(Date.UTC(2026, 9, 2, 1, 0));

const PROPS: ComponentProps<typeof StockHeaderLivePrice> = {
  ticker: "005930",
  initialPrice: 138300,
  initialChange: 3600,
  initialChangeRate: 2.67,
  initialDate: "2026-10-01",
  initialVolume: 12_000_000,
  initialRegularClose: { price: 138300, change: 3600, changeRate: 2.67 },
  shares: 5_919_637_922,
  nxEligible: true,
};

const QUOTE: StockQuoteResponse = {
  quote: {
    ticker: "005930",
    price: 139000,
    change: 700,
    changeRate: 0.51,
    sign: "up",
    open: 138500,
    high: 139500,
    low: 138000,
    volume: 3_000_000,
  },
  marketOpen: true,
  session: "regular",
  date: "2026-10-02",
  quoteDate: "2026-10-02",
  regularClose: null,
  failed: false,
};

const tree = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <StockHeaderLivePrice {...PROPS} />
  </QueryClientProvider>
);

describe("StockHeaderLivePrice hydration — 다른 경계가 먼저 채운 시세 캐시", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    container.remove();
    vi.useRealTimers();
  });

  it("서버 HTML 과 어긋나지 않고, hydration 뒤에는 응답의 토글을 그린다", async () => {
    container.innerHTML = renderToString(tree(new QueryClient()));

    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(stockQuoteQueryKey(PROPS.ticker, "krx"), QUOTE);
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, tree(client), { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "시장 구분" })).toBeInTheDocument();
  });
});
