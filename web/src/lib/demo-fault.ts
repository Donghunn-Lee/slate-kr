import type { NextRequest } from "next/server";
import { DEMO_FAULT_COOKIE, parseDemoFaultMode } from "@/shared/constants/demoFaultCookie";

export const DEMO_FAULT_DELAY_MS = 3_000;

// 가격 route 핸들러의 try 첫 줄에서 부른다. 실패는 throw 라 각 route 의 기존 catch 가 만드는
// 실패 응답을 그대로 탄다. unstable_cache 콜백 안에서 부르지 않는 이유: 캐시 함수 안에서는
// 쿠키를 읽을 수 없고, 주입된 실패가 캐시되면 다른 사용자에게도 서빙된다.
export const applyDemoFault = async (req: Pick<NextRequest, "cookies">): Promise<void> => {
  const mode = parseDemoFaultMode(req.cookies.get(DEMO_FAULT_COOKIE)?.value);
  if (mode === "delay") {
    await new Promise<void>((resolve) => setTimeout(resolve, DEMO_FAULT_DELAY_MS));
  } else if (mode === "fail") {
    throw new Error("[demo-fault] injected failure");
  }
};
