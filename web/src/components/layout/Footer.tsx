import Link from "next/link";

export const Footer = () => (
  <footer className="mt-auto border-t border-border/60 py-6">
    <div className="mx-auto max-w-4xl space-y-1 px-4 text-center text-xs text-muted-foreground">
      <p>주가·재무 데이터 출처: 한국거래소(KRX) / 금융감독원 DART</p>
      <p>
        차트:{" "}
        <Link
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          TradingView Lightweight Charts™
        </Link>
      </p>
      <p>이 서비스는 투자 참고용이며, 투자 권유 또는 종목 추천이 아닙니다.</p>
      <p>
        <Link
          href="https://github.com/Donghunn-Lee/slate-kr"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          GitHub
        </Link>
      </p>
    </div>
  </footer>
);
