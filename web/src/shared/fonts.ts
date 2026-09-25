import localFont from "next/font/local";

// CSS 변수를 못 읽는 차트 캔버스도 같은 인스턴스의 family 이름을 쓰도록 한 곳에서 선언한다.
export const suit = localFont({
  src: "../../public/fonts/SUIT-Variable.woff2",
  variable: "--font-suit",
  display: "swap",
  weight: "100 900",
});
