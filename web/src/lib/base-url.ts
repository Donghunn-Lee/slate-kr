// 사이트 절대 URL(metadataBase · sitemap · robots). 명시값이 없는 Vercel 배포는 프로덕션 도메인으로
// 떨어져야 한다 — 프리뷰 배포도 canonical·sitemap 이 프로덕션을 가리키게.
// VERCEL_PROJECT_PRODUCTION_URL 은 스킴 없는 호스트명이라 https 를 붙인다.
export const getBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
