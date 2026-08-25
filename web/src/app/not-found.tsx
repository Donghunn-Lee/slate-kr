import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
};

export default function NotFound() {
  return (
    <main className="container mx-auto max-w-xl px-4 py-16">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-caption text-muted-foreground">404</p>
        <h1 className="mt-2 text-headline font-semibold">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-body text-muted-foreground">
          요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/search">종목 검색</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
