"use client";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ reset }: ErrorProps) {
  return (
    <div className="rounded-lg border border-border p-6">
      <p className="mb-3 text-muted-foreground">섹션을 불러오지 못했습니다.</p>
      <button onClick={reset} className="text-sm text-sky-accent hover:underline">
        다시 시도
      </button>
    </div>
  );
}
