"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useStockSearch,
  type SearchResultItem,
} from "@/features/search/useStockSearch";

import { useWatchlistStore } from "./store/useWatchlistStore";
import {
  addMembershipIn,
  createGroupIn,
  deleteGroupIn,
  MAX_WATCHLIST_SIZE,
  moveGroupIn,
  moveMembershipIn,
  removeMembershipIn,
  renameGroupIn,
} from "./store/watchlistSnapshot";
import type {
  WatchlistGroup,
  WatchlistSnapshot,
} from "./store/watchlistSnapshot";

type GroupManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroupId?: string | null;
};

const emptySnapshot = (): WatchlistSnapshot => ({
  groups: [],
  memberships: [],
  stockMeta: {},
});

const narrowMarket = (m: string): "KOSPI" | "KOSDAQ" | null => {
  if (m === "KOSPI" || m === "KOSDAQ") return m;
  return null;
};

type GroupNameInlineProps = {
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  ariaLabel: string;
  className?: string;
};

const GroupNameInline = ({
  initial = "",
  onSubmit,
  onCancel,
  ariaLabel,
  className,
}: GroupNameInlineProps) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      aria-label={ariaLabel}
      className={cn("h-7 text-sm", className)}
    />
  );
};

export const GroupManagementModal = ({
  open,
  onOpenChange,
  initialGroupId = null,
}: GroupManagementModalProps) => {
  const replaceAll = useWatchlistStore((s) => s.replaceAll);

  const [prevOpen, setPrevOpen] = useState(open);
  const [local, setLocal] = useState<WatchlistSnapshot>(emptySnapshot);
  const [original, setOriginal] = useState<WatchlistSnapshot>(emptySnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WatchlistGroup | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const [query, setQuery] = useState("");
  const [searchDismissed, setSearchDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const {
    results: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useStockSearch(query);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const { groups, memberships, stockMeta } = useWatchlistStore.getState();
      const snapshot: WatchlistSnapshot = { groups, memberships, stockMeta };
      setLocal(snapshot);
      setOriginal(snapshot);
      const sorted = [...groups].sort((a, b) => a.order - b.order);
      const init =
        initialGroupId && sorted.some((g) => g.id === initialGroupId)
          ? initialGroupId
          : (sorted[0]?.id ?? null);
      setSelectedId(init);
      setRenamingId(null);
      setIsCreating(false);
      setPendingDelete(null);
      setShowLeaveConfirm(false);
      setQuery("");
      setSearchDismissed(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    if (searchError) toast.error(searchError);
  }, [searchError]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [searchResults]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(e.target as Node)
      ) {
        setSearchDismissed(true);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const sortedGroups = useMemo(
    () => [...local.groups].sort((a, b) => a.order - b.order),
    [local.groups]
  );

  const isDirty = useMemo(
    () => JSON.stringify(local) !== JSON.stringify(original),
    [local, original]
  );

  const selectedGroup = useMemo(
    () => sortedGroups.find((g) => g.id === selectedId) ?? null,
    [sortedGroups, selectedId]
  );

  const selectedTickers = useMemo(() => {
    if (!selectedGroup) return [];
    return local.memberships
      .filter((m) => m.groupId === selectedGroup.id)
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const meta = local.stockMeta[m.ticker];
        if (!meta) return null;
        return { ticker: m.ticker, name: meta.name, market: meta.market };
      })
      .filter(
        (x): x is { ticker: string; name: string; market: "KOSPI" | "KOSDAQ" } =>
          x !== null
      );
  }, [local.memberships, local.stockMeta, selectedGroup]);

  const showDropdown =
    !!selectedGroup && !searchDismissed && query.trim() !== "" && !searchError;

  const isAddedToSelected = (ticker: string): boolean =>
    !!selectedGroup &&
    local.memberships.some(
      (m) => m.groupId === selectedGroup.id && m.ticker === ticker
    );

  const requestClose = () => {
    if (isDirty) setShowLeaveConfirm(true);
    else onOpenChange(false);
  };

  const handleSave = () => {
    replaceAll(local);
    onOpenChange(false);
  };

  const handleConfirmLeave = () => {
    setShowLeaveConfirm(false);
    onOpenChange(false);
  };

  const handleMove = (id: string, dir: "up" | "down") => {
    setLocal((prev) => moveGroupIn(prev, id, dir));
  };

  const handleRename = (id: string, name: string) => {
    setLocal((prev) => renameGroupIn(prev, id, name));
    setRenamingId(null);
  };

  const handleCreate = (name: string) => {
    const next = createGroupIn(local, name);
    setLocal(next);
    const created = next.groups[next.groups.length - 1];
    if (created) setSelectedId(created.id);
    setIsCreating(false);
  };

  const performDelete = (id: string) => {
    const sorted = [...local.groups].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((g) => g.id === id);
    const replacement = sorted[idx + 1] ?? sorted[idx - 1] ?? null;
    setLocal((prev) => deleteGroupIn(prev, id));
    if (selectedId === id) {
      setSelectedId(replacement?.id ?? null);
    }
  };

  const handleDeleteRequest = (group: WatchlistGroup) => {
    const hasMembers = local.memberships.some((m) => m.groupId === group.id);
    if (hasMembers) {
      setPendingDelete(group);
    } else {
      performDelete(group.id);
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    performDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleRemoveMembership = (ticker: string, groupId: string) => {
    setLocal((prev) => removeMembershipIn(prev, ticker, groupId));
  };

  const handleMoveTicker = (ticker: string, dir: "up" | "down") => {
    if (!selectedGroup) return;
    setLocal((prev) => moveMembershipIn(prev, ticker, selectedGroup.id, dir));
  };

  const handleAdd = (item: SearchResultItem) => {
    if (!selectedGroup) return;
    if (isAddedToSelected(item.ticker)) return;
    const market = narrowMarket(item.market);
    if (!market) {
      toast.error("지원하지 않는 시장의 종목입니다.");
      return;
    }
    const next = addMembershipIn(
      local,
      { ticker: item.ticker, name: item.name, market },
      selectedGroup.id
    );
    if (next === null) {
      toast.error(
        `관심종목은 최대 ${MAX_WATCHLIST_SIZE}개까지 추가할 수 있습니다.`
      );
      return;
    }
    setLocal(next);
  };

  const findNextEnabled = (from: number, dir: 1 | -1): number => {
    let i = from + dir;
    while (i >= 0 && i < searchResults.length) {
      if (!isAddedToSelected(searchResults[i].ticker)) return i;
      i += dir;
    }
    return from;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && showDropdown) {
      e.preventDefault();
      e.stopPropagation();
      setSearchDismissed(true);
      setActiveIndex(-1);
      return;
    }
    if (!showDropdown || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => findNextEnabled(prev, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => findNextEnabled(prev, -1));
    } else if (e.key === "Enter") {
      if (activeIndex < 0) return;
      const target = searchResults[activeIndex];
      if (!target) return;
      if (isAddedToSelected(target.ticker)) return;
      e.preventDefault();
      handleAdd(target);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent className="flex h-[680px] max-h-[90dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>관심종목 그룹 관리</DialogTitle>
            <DialogDescription>
              그룹 추가·이름 변경·순서 변경과 그룹 내 종목 편집을 한 곳에서 진행합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[14rem_1fr]">
            <div className="flex min-h-0 flex-col gap-1">
              <ul
                className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
                aria-label="관심종목 그룹 목록"
              >
                {sortedGroups.map((g, idx) => {
                  const isSelected = g.id === selectedId;
                  const canMoveUp = idx > 0;
                  const canMoveDown = idx < sortedGroups.length - 1;
                  const isRenaming = renamingId === g.id;
                  return (
                    <li key={g.id}>
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                          isSelected ? "bg-peach-bg" : "hover:bg-muted/40"
                        )}
                      >
                        {isRenaming ? (
                          <GroupNameInline
                            initial={g.name}
                            onSubmit={(name) => handleRename(g.id, name)}
                            onCancel={() => setRenamingId(null)}
                            ariaLabel="그룹 이름 변경"
                            className="flex-1"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedId(g.id)}
                            className="flex-1 truncate text-left text-sm"
                          >
                            {g.name}
                          </button>
                        )}
                        <div
                          className="flex flex-col"
                          aria-label="그룹 순서 변경"
                        >
                          <button
                            type="button"
                            disabled={!canMoveUp}
                            onClick={() => handleMove(g.id, "up")}
                            aria-label="그룹 순서 위로"
                            className="flex h-3.5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ChevronUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown}
                            onClick={() => handleMove(g.id, "down")}
                            aria-label="그룹 순서 아래로"
                            className="flex h-3.5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ChevronDown className="size-3" />
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRenamingId(g.id)}
                          aria-label="그룹 이름 변경"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteRequest(g)}
                          aria-label="그룹 삭제"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="shrink-0 pt-1">
                {isCreating ? (
                  <GroupNameInline
                    onSubmit={handleCreate}
                    onCancel={() => setIsCreating(false)}
                    ariaLabel="새 그룹 이름"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="flex w-full items-center gap-1 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    <Plus className="size-4" />
                    그룹 추가
                  </button>
                )}
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col rounded-md border border-subtle bg-background p-3">
              {!selectedGroup ? (
                <p className="text-sm text-muted-foreground">
                  왼쪽에서 그룹을 선택하거나 새로 만드세요.
                </p>
              ) : (
                <>
                  <div ref={searchWrapperRef} className="relative shrink-0">
                    <Input
                      type="text"
                      placeholder="종목명 또는 종목코드 검색"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchDismissed(false);
                      }}
                      onFocus={() => setSearchDismissed(false)}
                      onKeyDown={handleSearchKeyDown}
                      autoComplete="off"
                      className="h-8 text-sm"
                      aria-label="종목 검색"
                    />
                    {showDropdown && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        {searchLoading ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            검색 중...
                          </div>
                        ) : searchResults.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            검색 결과가 없습니다
                          </div>
                        ) : (
                          <ul
                            className="max-h-64 overflow-y-auto"
                            role="listbox"
                            aria-label="종목 검색 결과"
                          >
                            {searchResults.map((r, index) => {
                              const added = isAddedToSelected(r.ticker);
                              const active = index === activeIndex;
                              return (
                                <li
                                  key={r.ticker}
                                  role="option"
                                  aria-selected={active}
                                  aria-disabled={added}
                                >
                                  <button
                                    type="button"
                                    disabled={added}
                                    onMouseDown={(e) => {
                                      if (added) return;
                                      e.preventDefault();
                                      handleAdd(r);
                                    }}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    className={cn(
                                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                                      added
                                        ? active
                                          ? "bg-muted/60 text-muted-foreground"
                                          : "bg-muted/40 text-muted-foreground"
                                        : active
                                          ? "bg-accent"
                                          : "hover:bg-accent"
                                    )}
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="truncate font-medium">
                                        {r.name}
                                      </span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {r.ticker}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {r.market}
                                      </span>
                                    </div>
                                    {added && (
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        등록됨
                                      </span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    이 그룹의 종목
                  </div>
                  <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                    {selectedTickers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        이 그룹에 종목이 없습니다.
                      </p>
                    ) : (
                      <ul className="space-y-1" aria-label="그룹 내 종목">
                        {selectedTickers.map((t, idx) => {
                          const canMoveUp = idx > 0;
                          const canMoveDown = idx < selectedTickers.length - 1;
                          return (
                            <li
                              key={t.ticker}
                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm">{t.name}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {t.ticker}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {t.market}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div
                                  className="flex flex-col"
                                  aria-label="종목 순서 변경"
                                >
                                  <button
                                    type="button"
                                    disabled={!canMoveUp}
                                    onClick={() => handleMoveTicker(t.ticker, "up")}
                                    aria-label="종목 순서 위로"
                                    className="flex h-3.5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                                  >
                                    <ChevronUp className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canMoveDown}
                                    onClick={() => handleMoveTicker(t.ticker, "down")}
                                    aria-label="종목 순서 아래로"
                                    className="flex h-3.5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                                  >
                                    <ChevronDown className="size-3" />
                                  </button>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() =>
                                    handleRemoveMembership(t.ticker, selectedGroup.id)
                                  }
                                  aria-label={`${t.name} 제거`}
                                >
                                  <X />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={!isDirty}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              &lsquo;{pendingDelete?.name}&rsquo; 그룹을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 그룹에만 속한 종목은 관심종목에서 함께 제거됩니다. 저장 시 변경이 적용됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showLeaveConfirm}
        onOpenChange={(o) => {
          if (!o) setShowLeaveConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              지금 닫으면 편집 내용이 모두 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 편집</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>
              나가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
