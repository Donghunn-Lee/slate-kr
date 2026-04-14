"use client";

import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWatchlistStore } from "./store/useWatchlistStore";

const MAX_WATCHLIST_SIZE = 50;

type WatchlistButtonProps = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export const WatchlistButton = ({ ticker, name, market }: WatchlistButtonProps) => {
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(ticker));
  const addToWatchlist = useWatchlistStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);
  const itemCount = useWatchlistStore((s) => s.items.length);

  const handleClick = () => {
    if (isInWatchlist) {
      removeFromWatchlist(ticker);
      return;
    }

    if (itemCount >= MAX_WATCHLIST_SIZE) {
      toast.error(`관심종목은 최대 ${MAX_WATCHLIST_SIZE}개까지 추가할 수 있습니다.`);
      return;
    }

    addToWatchlist({ ticker, name, market });
  };

  return (
    <Button
      variant={isInWatchlist ? "secondary" : "outline"}
      size="sm"
      onClick={handleClick}
      aria-label={isInWatchlist ? "관심종목 해제" : "관심종목 추가"}
      aria-pressed={isInWatchlist}
    >
      <Star className={isInWatchlist ? "fill-current" : ""} />
      {isInWatchlist ? "관심종목 해제" : "관심종목 추가"}
    </Button>
  );
};
