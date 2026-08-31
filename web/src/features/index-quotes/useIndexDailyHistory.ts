import { useQuery } from "@tanstack/react-query";
import type { IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

// 지수 1종의 전체 일봉 이력 — opt-in 훅. enabled=true 시에만 fetch.
// staleTime=1h → 세션 내 지수 재선택 시 캐시 히트로 재요청 없음.
export const useIndexDailyHistory = (code: IndexCode, enabled: boolean) =>
  useQuery<IndexDailySnapshot[]>({
    queryKey: ["index-daily", code],
    queryFn: async () => {
      const res = await fetch(`/api/index-daily?code=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("index daily fetch failed");
      return res.json();
    },
    enabled,
    staleTime: 3_600_000,
  });
