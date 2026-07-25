import { ServiceCardCarousel } from "./ServiceCardCarousel";

export const HomeHero = () => {
  return (
    <section className="grid gap-8 pt-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className="md:pr-2">
        <h1 className="text-3xl font-bold tracking-tight">SlateKR</h1>
        <h2 className="mt-4 text-lg font-semibold text-foreground sm:text-xl">
          국내 상장 종목의 가격 · 재무 · 공시를 한 곳에서
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          흩어진 종목 정보를 구조화해 빠르게 조회하는 서비스입니다
        </p>
      </div>
      <ServiceCardCarousel />
    </section>
  );
};
