"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useMemoStore } from "./store/useMemoStore";
import { isSnapshotEqual, selectSnapshot } from "./store/memoSnapshot";
import type {
  MemoGetResponse,
  MemoPutResponse,
  MemoSnapshot,
} from "@/shared/types/memo";

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

const fetchGet = async (): Promise<MemoGetResponse | null> => {
  try {
    const res = await fetch("/api/memos", {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return (await res.json()) as MemoGetResponse;
  } catch {
    return null;
  }
};

const fetchPut = async (
  snapshot: MemoSnapshot
): Promise<MemoPutResponse | null> => {
  try {
    const res = await fetch("/api/memos", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) {
      try {
        return (await res.json()) as MemoPutResponse;
      } catch {
        return null;
      }
    }
    return (await res.json()) as MemoPutResponse;
  } catch {
    return null;
  }
};

export const useMemoSync = () => {
  const lastConfirmedRef = useRef<MemoSnapshot | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const rescheduleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const setStatus = (
      status: "idle" | "loading" | "synced" | "blocked" | "error"
    ) => {
      useMemoStore.getState().setSyncStatus(status);
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
      const snapshot = selectSnapshot(useMemoStore.getState());
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
        const now = selectSnapshot(useMemoStore.getState());
        if (!isSnapshotEqual(now, lastConfirmedRef.current)) {
          scheduleFlush();
        } else if (rescheduleRef.current) {
          rescheduleRef.current = false;
          scheduleFlush();
        }
      } else {
        const kind = result && !result.ok ? result.error.kind : "network";
        console.error(`[memo-sync] put failed: ${kind}`);
        rescheduleRef.current = false;
        if (lastConfirmedRef.current === null) {
          lastConfirmedRef.current = snapshot;
          setStatus("error");
        } else {
          useMemoStore.getState().replaceAll(lastConfirmedRef.current);
          setStatus("error");
          toast.error(
            "메모를 저장하지 못했어요. 변경 전으로 되돌렸어요."
          );
        }
      }
    };

    const runLoad = async () => {
      if (!hasSyncMarker()) {
        // 서버에 없음이 확정. 로컬 baseline 을 잡고 첫 setMemo 가 PUT 을 유발하게 둔다.
        lastConfirmedRef.current = selectSnapshot(useMemoStore.getState());
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
        console.error("[memo-sync] get failed after retry");
        lastConfirmedRef.current = null;
        setStatus("blocked");
        return;
      }
      if (!response.ok) {
        console.error(`[memo-sync] get error: ${response.error.kind}`);
        lastConfirmedRef.current = null;
        setStatus("blocked");
        return;
      }

      if (response.data === null) {
        lastConfirmedRef.current = selectSnapshot(useMemoStore.getState());
        setStatus("synced");
        return;
      }

      const serverSnapshot = response.data.snapshot;
      useMemoStore.getState().replaceAll(serverSnapshot);
      lastConfirmedRef.current = selectSnapshot(useMemoStore.getState());
      setStatus("synced");
    };

    const unsubscribe = useMemoStore.subscribe((state, prev) => {
      if (state.memos === prev.memos) return;
      if (state.syncStatus === "loading") return;
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
      const snapshot = selectSnapshot(useMemoStore.getState());
      if (isSnapshotEqual(snapshot, lastConfirmedRef.current)) return;
      try {
        fetch("/api/memos", {
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
