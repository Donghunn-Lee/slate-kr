type PageProps = {
  params: Promise<{ ticker: string }>;
};

async function StockDetailPage({ params }: PageProps) {
  const { ticker } = await params;

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">{ticker}</h1>
      <p className="mt-2 text-sm text-muted-foreground">종목 상세 페이지 — 구현 예정</p>
    </main>
  );
}

export default StockDetailPage;
