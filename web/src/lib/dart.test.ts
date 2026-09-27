import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { findDisclosure } from "./dart";

const mkItem = (rceptNo: string) => ({
  corp_name: "현대로템",
  report_nm: "[기재정정]단일판매ㆍ공급계약체결",
  rcept_no: rceptNo,
  flr_nm: "현대로템",
  rcept_dt: rceptNo.slice(0, 8),
  rm: "유",
});

const mkPage = (rceptNos: string[], totalPage: number) =>
  new Response(
    JSON.stringify({
      status: "000",
      list: rceptNos.map(mkItem),
      total_count: rceptNos.length,
      total_page: totalPage,
    })
  );

describe("findDisclosure", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("DART_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // KST 자정으로 날짜를 만들면 UTC 변환에서 전날로 밀린다 — 접수일이 그대로 나가는지 본다.
  it("접수일 하루를 캐시 없이 조회하고 일치 행을 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(mkPage(["20260923800386"], 1));

    const found = await findDisclosure("00000001", "20260923800386");

    expect(found).toMatchObject({
      rcpNo: "20260923800386",
      disclosureNm: "[기재정정]단일판매ㆍ공급계약체결",
      corpName: "현대로템",
    });
    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(String(url)).searchParams;
    expect(params.get("bgn_de")).toBe("20260923");
    expect(params.get("end_de")).toBe("20260923");
    expect(params.get("corp_code")).toBe("00000001");
    expect(init).toMatchObject({ next: { revalidate: 0 } });
  });

  it("첫 페이지에 없으면 다음 페이지까지 찾는다", async () => {
    fetchMock
      .mockResolvedValueOnce(mkPage(["20260923000001"], 2))
      .mockResolvedValueOnce(mkPage(["20260923000002"], 2));

    const found = await findDisclosure("00000001", "20260923000002");

    expect(found?.rcpNo).toBe("20260923000002");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("page_no")).toBe("2");
  });

  it("모든 페이지에 없으면 null", async () => {
    fetchMock
      .mockResolvedValueOnce(mkPage(["20260923000001"], 2))
      .mockResolvedValueOnce(mkPage(["20260923000002"], 2));

    expect(await findDisclosure("00000001", "20260923999999")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("그날 공시가 없으면(status 013) 한 번만 조회하고 null", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "013" })));

    expect(await findDisclosure("00000001", "20260923800386")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
