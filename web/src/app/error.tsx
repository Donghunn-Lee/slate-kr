"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container mx-auto max-w-xl px-4 py-16">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-headline font-semibold">일시적인 오류가 발생했습니다</h1>
        <p className="mt-3 text-body text-muted-foreground">
          잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={reset}>
            다시 시도
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
