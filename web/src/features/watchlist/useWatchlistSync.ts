"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useWatchlistStore } from "./store/useWatchlistStore";
import {
  isSnapshotEqual,
  selectSnapshot,
} from "./store/watchlistSnapshot";
import type {
  WatchlistGetResponse,
  WatchlistPutResponse,
  WatchlistSnapshot,
} from "@/shared/types/watchlist";

const SYNC_MARKER_COOKIE = "slatekr_sync";
const DEBOUNCE_MS = 300;
const GET_RETRY_DELAY_MS = 2000;
const PUT_RETRY_DELAY_MS = 1000;

const hasSyncMarker = (): boolean =>
  typeof document !== "undefined" &&
  document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${SYNC_MARKER_COOKIE}=`));

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

// Zod 검증은 서버 측 upsert 경로에서 하고, 클라 로드 경로는 route 응답의 형태만 확인.
const fetchGet = async (): Promise<WatchlistGetResponse | null> => {
  try {
    const res = await fetch("/api/watchlist", {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return (await res.json()) as WatchlistGetResponse;
  } catch {
    return null;
  }
};

const fetchPut = async (
  snapshot: WatchlistSnapshot
): Promise<WatchlistPutResponse | null> => {
  try {
    const res = await fetch("/api/watchlist", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) {
      // 실패라도 서버가 kind 를 줬으면 그대로 반환 — 상단에서 로깅.
      try {
        return (await res.json()) as WatchlistPutResponse;
      } catch {
        return null;
      }
    }
    return (await res.json()) as WatchlistPutResponse;
  } catch {
    return null;
  }
};

export const useWatchlistSync = () => {
  const lastConfirmedRef = useRef<WatchlistSnapshot | null>(null);
  const dirtyDuringLoadRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const rescheduleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const setStatus = (
      status: "idle" | "loading" | "synced" | "blocked" | "error"
    ) => {
      useWatchlistStore.getState().setSyncStatus(status);
    };

    const scheduleFlush = () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    };

    const flush = async (): Promise<void> => {
      if (cancelled) return;
      if (inFlightRef.current) {
        rescheduleRef.current = true;
        return;
      }
      const snapshot = selectSnapshot(useWatchlistStore.getState());
      if (isSnapshotEqual(snapshot, lastConfirmedRef.current)) return;

      inFlightRef.current = true;
      let result = await fetchPut(snapshot);
      if (!result || !result.ok) {
        await sleep(PUT_RETRY_DELAY_MS);
        if (!cancelled) result = await fetchPut(snapshot);
      }
      inFlightRef.current = false;
      if (cancelled) return;

      if (result && result.ok) {
        lastConfirmedRef.current = snapshot;
        setStatus("synced");
        const now = selectSnapshot(useWatchlistStore.getState());
        if (!isSnapshotEqual(now, lastConfirmedRef.current)) {
          scheduleFlush();
        } else if (rescheduleRef.current) {
          rescheduleRef.current = false;
          scheduleFlush();
        }
      } else {
        const kind = result && !result.ok ? result.error.kind : "network";
        console.error(`[watchlist-sync] put failed: ${kind}`);
        if (lastConfirmedRef.current !== null) {
          useWatchlistStore.getState().replaceAll(lastConfirmedRef.current);
        }
        rescheduleRef.current = false;
        setStatus("error");
        toast.error(
          "관심종목을 저장하지 못했어요. 변경 전으로 되돌렸어요."
        );
      }
    };

    const runLoad = async () => {
      if (!hasSyncMarker()) {
        // 서버에 없음이 확정 — 로컬 스냅샷을 baseline 으로 잡고 첫 mutation 이 PUT 을 유발한다.
        lastConfirmedRef.current = selectSnapshot(useWatchlistStore.getState());
        setStatus("synced");
        return;
      }

      setStatus("loading");
      let response = await fetchGet();
      if (response === null) {
        await sleep(GET_RETRY_DELAY_MS);
        if (cancelled) return;
        response = await fetchGet();
      }
      if (cancelled) return;

      if (response === null) {
        console.error("[watchlist-sync] get failed after retry");
        lastConfirmedRef.current = null;
        setStatus("blocked");
        return;
      }
      if (!response.ok) {
        console.error(
          `[watchlist-sync] get error: ${response.error.kind}`
        );
        lastConfirmedRef.current = null;
        setStatus("blocked");
        return;
      }

      if (response.data === null) {
        lastConfirmedRef.current = selectSnapshot(
          useWatchlistStore.getState()
        );
        setStatus("synced");
        dirtyDuringLoadRef.current = false;
        return;
      }

      const serverSnapshot = response.data.snapshot;
      if (dirtyDuringLoadRef.current) {
        // 로컬이 더 새것. 서버 스냅샷은 적용하지 않고 baseline 으로만 잡아
        // 이어지는 write 판정이 로컬 전체를 PUT 하게 한다.
        lastConfirmedRef.current = serverSnapshot;
        setStatus("synced");
        dirtyDuringLoadRef.current = false;
        scheduleFlush();
        return;
      }

      useWatchlistStore.getState().replaceAll(serverSnapshot);
      // replaceAll 의 stockMeta GC 결과를 baseline 으로 잡아야 이후 write 판정이
      // 불필요한 PUT 을 유발하지 않는다.
      lastConfirmedRef.current = selectSnapshot(useWatchlistStore.getState());
      setStatus("synced");
      dirtyDuringLoadRef.current = false;
    };

    const unsubscribe = useWatchlistStore.subscribe((state, prev) => {
      // 데이터 3필드가 참조 동일 → syncStatus 등 다른 변경 → 무시.
      if (
        state.groups === prev.groups &&
        state.memberships === prev.memberships &&
        state.stockMeta === prev.stockMeta
      ) {
        return;
      }
      if (state.syncStatus === "loading") {
        dirtyDuringLoadRef.current = true;
        return;
      }
      if (state.syncStatus === "blocked") return;

      const snapshot = selectSnapshot(state);
      if (isSnapshotEqual(snapshot, lastConfirmedRef.current)) return;

      scheduleFlush();
    });

    const handlePageHide = () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const snapshot = selectSnapshot(useWatchlistStore.getState());
      if (isSnapshotEqual(snapshot, lastConfirmedRef.current)) return;
      try {
        fetch("/api/watchlist", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
          keepalive: true,
        });
      } catch {
        // keepalive 실패는 다음 로드에서 서버가 없거나 이전 값으로 남을 뿐 — 조용히 무시.
      }
    };
    window.addEventListener("pagehide", handlePageHide);

    void runLoad();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("pagehide", handlePageHide);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);
};
