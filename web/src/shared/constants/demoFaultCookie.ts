// 장애 시뮬레이션 쿠키. 클라 토글(쓰기)과 가격 route 의 lib/demo-fault(읽기)가 이 이름 · 파서만 참조한다.
export const DEMO_FAULT_COOKIE = "slatekr_demo_fault";

export type DemoFaultMode = "delay" | "fail";

// 쿠키가 없거나 값을 모르면 null = 정상.
export const parseDemoFaultMode = (raw: string | undefined): DemoFaultMode | null =>
  raw === "delay" || raw === "fail" ? raw : null;
