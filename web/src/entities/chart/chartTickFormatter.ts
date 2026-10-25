import { TickMarkType, type Time } from "lightweight-charts";
import { toKstWallClockSec } from "@/shared/utils/toKstWallClockSec";

// Time → 비교/포맷용 문자열 키.
export const timeToKey = (
  t: string | number | { year: number; month: number; day: number }
): string => {
  if (typeof t === "string") return t;
  if (typeof t === "number") return String(t);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
};

// TickMarkType 별 한국식 연-월-일 순 라벨. day/month 전용 (timeVisible 시 미적용).
export const chartTickFormatter = (time: Time, tickMarkType: TickMarkType): string => {
  let y: number, m: number, d: number;
  if (typeof time === "string") {
    const [ys, ms, ds] = time.split("-").map(Number);
    y = ys;
    m = ms;
    d = ds;
  } else if (typeof time === "number") {
    const dt = new Date(time * 1000);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  } else {
    y = time.year;
    m = time.month;
    d = time.day;
  }
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  switch (tickMarkType) {
    case TickMarkType.Year:
      // 2자리(예: 2026 → 26). 축 밀도 절감. crosshair 툴팁은 localization.timeFormatter 가 담당.
      return String(y % 100).padStart(2, "0");
    case TickMarkType.Month:
      return mm;
    case TickMarkType.DayOfMonth:
      return `${mm}-${dd}`;
    default:
      return `${y}-${mm}-${dd}`;
  }
};

// 거래소 벽시계로 인코딩된 분봉 눈금을 KST 로 옮겨 라벨링. 눈금 위치·종류는 라이브러리가 원래
// time 으로 정하므로 날짜 눈금은 현지 날짜가 바뀌는 자리(세션 시작)에 남는다.
// 시각은 직접 HH:mm 으로 낸다 — 기본 포맷(ko-KR · hour12:false)은 자정을 "24:00" 으로 낸다.
// 날짜 눈금은 기본 포맷과 같은 옵션("8일" · "10월" · "2026년")에 KST 날짜만 바꿔 넣는다.
export const kstIntradayTickFormatter =
  (barTimeZone: string) =>
  (time: Time, tickMarkType: TickMarkType, locale: string): string | null => {
    if (typeof time !== "number") return null;
    const kst = new Date(toKstWallClockSec(time, barTimeZone) * 1000);
    const date = new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
    switch (tickMarkType) {
      case TickMarkType.Year:
        return date.toLocaleString(locale, { year: "numeric" });
      case TickMarkType.Month:
        return date.toLocaleString(locale, { month: "short" });
      case TickMarkType.DayOfMonth:
        return date.toLocaleString(locale, { day: "numeric" });
      default:
        return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
    }
  };
