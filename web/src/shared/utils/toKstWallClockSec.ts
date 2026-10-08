import { TZDate } from "@date-fns/tz";

const KST_ZONE = "Asia/Seoul";

// 거래소 현지 벽시계를 UTC 로 위장한 epoch 초(해외 분봉 time 인코딩)를 같은 방식의 KST 벽시계
// 초로 옮긴다. 봉 time 자체는 병합·fold·세션 경계가 현지 인코딩에 기대고 있어 그대로 두고,
// 표시 지점(눈금·크로스헤어)에서만 이 값을 쓴다.
// 현지 → 실제 시점 → KST 를 IANA DB(TZDate)로 거쳐 DST 전환을 따로 다루지 않는다.
export const toKstWallClockSec = (localSec: number, timeZone: string): number => {
  const local = new Date(localSec * 1000);
  const kst = new TZDate(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    timeZone,
  ).withTimeZone(KST_ZONE);
  return Math.floor(
    Date.UTC(
      kst.getFullYear(),
      kst.getMonth(),
      kst.getDate(),
      kst.getHours(),
      kst.getMinutes(),
      kst.getSeconds(),
    ) / 1000,
  );
};
