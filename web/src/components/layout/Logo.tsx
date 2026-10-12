type LogoProps = {
  size?: number;
  className?: string;
};

// 판 3장: 위 무채(가격) · 중간 peach(핵심 지표) · 아래 sky(공시). 색은 라이트 · 다크 공용 고정 hex.
// 아래 판부터 그리고 위 판이 경계를 2단위 덮어 경계에 배경이 비치지 않게 한다. 겹침을 판 전체로 넓히면
// 외곽선을 여러 판이 공유해 안티앨리어싱이 겹쳐 쌓이고 가장자리가 진해진다(계단).
// 크기는 꼭짓점(y 20 · 40 · 60)이 정수 px에 오는 24 · 28 · 32를 쓴다.
export const Logo = ({ size = 24, className }: LogoProps) => (
  <svg
    viewBox="0 0 69.28 80"
    width={(size * 69.28) / 80}
    height={size}
    aria-hidden
    className={className}
  >
    <path d="M0 44.67 L34.64 64.67 L69.28 44.67 L69.28 60 L34.64 80 L0 60 Z" fill="#32A8C7" />
    <path
      d="M0 31.33 L34.64 51.33 L69.28 31.33 L69.28 46.67 L34.64 66.67 L0 46.67 Z"
      fill="#F28881"
    />
    <path
      d="M0 20 L1.73 19 L34.64 38 L67.55 19 L69.28 20 L69.28 33.33 L34.64 53.33 L0 33.33 Z"
      fill="#1E212B"
    />
    <path d="M34.64 0 L69.28 20 L34.64 40 L0 20 Z" fill="#2E323D" />
  </svg>
);
