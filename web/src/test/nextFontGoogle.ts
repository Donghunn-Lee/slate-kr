// next/font/google 은 Next 빌드 변환을 전제로 해 vitest 에선 호출할 수 없다 — 반환 객체 형태만 흉내 낸다.
export const Noto_Sans_KR = () => ({
  className: "",
  variable: "",
  style: { fontFamily: "sans-serif" },
});
