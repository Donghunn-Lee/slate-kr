"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, NotebookPen, NotebookText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MEMO_BODY_LENGTH } from "@/shared/types/memo";
import { useMemoStore } from "./store/useMemoStore";

type MemoButtonProps = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export const MemoButton = ({ ticker, name, market }: MemoButtonProps) => {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const memo = useMemoStore((s) => s.memos[ticker]);
  const syncStatus = useMemoStore((s) => s.syncStatus);
  const setMemo = useMemoStore((s) => s.setMemo);

  const hasMemo = Boolean(memo);
  const label = hasMemo ? "메모 수정" : "메모 작성";

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(memo?.body ?? "");
    setOpen(next);
  };

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" disabled aria-label="메모 작성">
        <NotebookPen />
      </Button>
    );
  }

  const currentBody = memo?.body ?? "";
  const trimmedDraft = draft.trim();
  const isUnchanged = trimmedDraft === currentBody;
  const showSyncBadge = syncStatus === "blocked" || syncStatus === "error";

  const handleSave = () => {
    setMemo(ticker, { body: draft, name, market });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={hasMemo ? "secondary" : "outline"}
          size="sm"
          aria-label={label}
        >
          {hasMemo ? (
            <NotebookText className="text-sky-accent" />
          ) : (
            <NotebookPen className="text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <PopoverHeader className="flex flex-row items-center justify-between gap-2 px-3 pt-3 pb-2">
          <PopoverTitle>메모</PopoverTitle>
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
        <div className="px-3 pb-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_MEMO_BODY_LENGTH}
            rows={6}
            className="resize-none"
            aria-label="메모 본문"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-caption text-muted-foreground tabular-nums">
                {draft.length}/{MAX_MEMO_BODY_LENGTH}
              </span>
              {showSyncBadge && (
                <span
                  title="메모가 이 브라우저에만 저장되어 있어요"
                  className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground"
                >
                  서버 저장 안 됨
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="취소"
              >
                <X />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleSave}
                disabled={isUnchanged}
                aria-label="저장"
              >
                <Check />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
