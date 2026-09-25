import { Noto_Sans_KR } from "next/font/google";

// CSS 변수를 못 읽는 차트 캔버스도 같은 인스턴스의 family 이름을 쓰도록 한 곳에서 선언한다.
// 한글은 번호 슬라이스(unicode-range)로만 제공돼 preload 대상이 못 된다 — 차트 축·가격 숫자가 쓰는 latin 만 preload.
export const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-noto",
  display: "swap",
});
