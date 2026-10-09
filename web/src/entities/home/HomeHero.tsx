import { ServiceCardCarousel } from "./ServiceCardCarousel";

export const HomeHero = () => {
  return (
    <section className="grid gap-8 pt-5 md:grid-cols-2 md:items-center md:gap-10 sm:pt-8">
      <div className="md:pr-2">
        <h1 className="text-3xl font-bold tracking-tight">SlateKR</h1>
        {/* sm 미만은 h2 · 설명을 짧은 문장으로 바꿔 둘 다 한 줄에 들어가게 한다(360px · fallback 글꼴 포함).
            한 줄을 넘겨 자연 줄바꿈이 생기면 fallback → 웹 글꼴 교체 때 줄 수가 바뀌어 아래 섹션 전체를 밀어낸다. */}
        <h2 className="mt-4 text-lg font-semibold text-foreground sm:text-xl">
          <span className="sm:hidden">
            <span className="whitespace-nowrap">주식 시세 · 재무 · 공시를</span>{" "}
            <span className="whitespace-nowrap">한 곳에서</span>
          </span>
          <span className="hidden sm:inline">
            <span className="whitespace-nowrap">국내 상장 종목의</span>{" "}
            <span className="whitespace-nowrap">가격 · 재무 · 공시를</span>{" "}
            <span className="whitespace-nowrap">한 곳에서</span>
          </span>
        </h2>
        <p className="mt-1 text-body text-muted-foreground">
          <span className="sm:hidden">흩어진 국내 상장 종목 정보를 구조화해 제공합니다</span>
          <span className="hidden sm:inline">
            <span className="whitespace-nowrap">흩어진 종목 정보를 구조화해</span>{" "}
            <span className="whitespace-nowrap">손쉽게 조회하는 서비스입니다</span>
          </span>
        </p>
      </div>
      <ServiceCardCarousel />
    </section>
  );
};
