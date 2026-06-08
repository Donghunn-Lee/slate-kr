"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, CircleCheck, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MAX_WATCHLIST_SIZE,
  selectGroupsByTicker,
  useWatchlistStore,
} from "./store/useWatchlistStore";

type WatchlistButtonProps = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

const CONFIRM_FADE_TRANSITION =
  "opacity var(--duration-base, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))";
const CONFIRM_HOLD_MS = 1200;

export const WatchlistButton = ({ ticker, name, market }: WatchlistButtonProps) => {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [open, setOpen] = useState(false);
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(ticker));

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" disabled aria-label="관심종목 추가">
        <Star />
        관심종목 추가
      </Button>
    );
  }

  const label = isInWatchlist ? "관심 그룹 편집" : "관심종목 추가";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isInWatchlist ? "secondary" : "outline"}
          size="sm"
          aria-label={label}
        >
          <Star className={isInWatchlist ? "fill-current" : ""} />
          {isInWatchlist ? "관심종목" : "관심종목 추가"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-[min(16rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <PopoverHeader className="flex flex-row items-center justify-between gap-2 px-3 pt-3 pb-2">
          <PopoverTitle>관심 그룹</PopoverTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label="닫기"
          >
            <X />
          </Button>
        </PopoverHeader>
        <GroupCheckList ticker={ticker} name={name} market={market} />
      </PopoverContent>
    </Popover>
  );
};

type GroupCheckListProps = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

const GroupCheckList = ({ ticker, name, market }: GroupCheckListProps) => {
  const groups = useWatchlistStore(
    useShallow((s) => [...s.groups].sort((a, b) => a.order - b.order))
  );
  const memberGroupIds = useWatchlistStore(
    useShallow((s) => selectGroupsByTicker(s, ticker).map((g) => g.id))
  );
  const addMembership = useWatchlistStore((s) => s.addMembership);
  const removeMembership = useWatchlistStore((s) => s.removeMembership);

  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const markAdded = (groupId: string) => {
    const existing = timersRef.current.get(groupId);
    if (existing) clearTimeout(existing);

    setRecentlyAdded((prev) => {
      if (prev.has(groupId)) return prev;
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });

    const t = setTimeout(() => {
      setRecentlyAdded((prev) => {
        if (!prev.has(groupId)) return prev;
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      timersRef.current.delete(groupId);
    }, CONFIRM_HOLD_MS);

    timersRef.current.set(groupId, t);
  };

  if (groups.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        그룹이 없습니다. 관심종목 페이지에서 그룹을 먼저 만들어주세요.
      </p>
    );
  }

  const memberSet = new Set(memberGroupIds);

  const handleToggle = (groupId: string) => {
    if (memberSet.has(groupId)) {
      removeMembership(ticker, groupId);
      return;
    }
    const ok = addMembership({ ticker, name, market }, groupId);
    if (!ok) {
      toast.error(`관심 종목은 최대 ${MAX_WATCHLIST_SIZE}종목까지 등록할 수 있습니다`);
      return;
    }
    markAdded(groupId);
  };

  return (
    <ul className="flex max-h-72 flex-col overflow-y-auto py-1">
      {groups.map((g) => {
        const checked = memberSet.has(g.id);
        const confirmed = recentlyAdded.has(g.id);
        return (
          <li key={g.id}>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              onClick={() => handleToggle(g.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded border border-input">
                {checked && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <CircleCheck
                aria-hidden
                className="size-4 shrink-0 text-sage-accent"
                style={{
                  opacity: confirmed ? 1 : 0,
                  transition: CONFIRM_FADE_TRANSITION,
                }}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
