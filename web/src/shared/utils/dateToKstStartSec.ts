// intraday bar time 은 KST 벽시계를 UTC 로 위장한 fake-UTC epoch 초(생성기 분봉 timestamp 규칙).
// KST 00:00 을 같은 규칙으로 인코딩하면 세션 경계 epoch 를 얻는다.
export const dateToKstStartSec = (yyyyMmDd: string): number => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
};
