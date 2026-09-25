import { ServiceCardCarousel } from "./ServiceCardCarousel";

export const HomeHero = () => {
  return (
    <section className="grid gap-8 pt-5 md:grid-cols-2 md:items-center md:gap-10 sm:pt-8">
      <div className="md:pr-2">
        <h1 className="text-3xl font-bold tracking-tight">SlateKR</h1>
        <h2 className="mt-4 text-lg font-semibold text-foreground sm:text-xl">
          <span className="whitespace-nowrap">국내 상장 종목의</span>{" "}
          <span className="whitespace-nowrap">가격 · 재무 · 공시를</span>{" "}
          <span className="whitespace-nowrap">한 곳에서</span>
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          <span className="whitespace-nowrap">흩어진 종목 정보를 구조화해</span>{" "}
          <span className="whitespace-nowrap">손쉽게 조회하는 서비스입니다</span>
        </p>
      </div>
      <ServiceCardCarousel />
    </section>
  );
};
