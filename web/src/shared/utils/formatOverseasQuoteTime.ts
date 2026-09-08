import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import {
  OVERSEAS_INDEX_CLOSE_LOCAL,
  OVERSEAS_INDEX_TIMEZONE,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type { IndexQuote } from "@/shared/types/quote";

const KST_ZONE = "Asia/Seoul";

// KIS FHKST03030200 output2 의 (date, hour) 는 거래소 현지 로컬 시각.
// 지수별 IANA 타임존으로 UTC 인스턴트를 확정한 뒤 KST "MM-dd HH:mm" 문자열로 렌더한다.
// DST 는 IANA DB(America/New_York 등)에 위임 — EST/EDT 자동 전환.
// 파싱 실패·유효하지 않은 시각은 null 반환(라벨 미표시).
// 상태 접미어("기준" · "장 마감") 는 호출측 조립 — 이 함수는 시각 문자열만 담당한다.
export const formatOverseasQuoteTime = (
  time: IndexQuote["time"],
  code: OverseasIndexCode,
): string | null => {
  if (!time) return null;
  const { date, hour } = time;
  if (date.length !== 8 || hour.length !== 6) return null;

  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6)) - 1;
  const d = Number(date.slice(6, 8));
  const hh = Number(hour.slice(0, 2));
  const mm = Number(hour.slice(2, 4));
  if ([y, mo, d, hh, mm].some((n) => !Number.isFinite(n))) return null;

  const tz = OVERSEAS_INDEX_TIMEZONE[code];
  // TZDate 는 (fields, zone) 을 그 zone 의 wall-clock 으로 해석 → UTC 인스턴트 확정.
  const localInstant = new TZDate(y, mo, d, hh, mm, 0, tz);
  if (Number.isNaN(localInstant.getTime())) return null;

  const kstInstant = localInstant.withTimeZone(KST_ZONE);
  return format(kstInstant, "MM-dd HH:mm");
};

// 마감 후 헤더 라벨. 거래소 로컬 세션 일자('yyyy-MM-dd')의 공식 마감 시각을 KST 로 환산해
// 국내 라벨과 같은 today-vs-past 2상태로 판정한다.
// 체결시각을 축으로 쓰지 않는 이유: 정산 프린트가 마감보다 늦게 찍혀 세션마다 표시 시각이
// 흔들리고, 날짜 축이 없어 지난 세션 값도 "장 마감" 으로 남는다.
// 수용 리스크: 미국 조기 폐장(연 4일 13:00 ET)은 close 상수 밖이라 미반영.
export const resolveOverseasCloseLabel = (
  sessionDate: string,
  code: OverseasIndexCode,
  kstToday: string | null,
): string | null => {
  if (sessionDate.length !== 10) return null;
  const y = Number(sessionDate.slice(0, 4));
  const mo = Number(sessionDate.slice(5, 7)) - 1;
  const d = Number(sessionDate.slice(8, 10));
  if ([y, mo, d].some((n) => !Number.isFinite(n))) return null;

  const pastLabel = `전일 종가 · ${sessionDate.slice(5, 7)}.${sessionDate.slice(8, 10)}`;
  // 클라 시계가 서기 전(kstToday=null)엔 today 축이 없어 날짜 표기까지만 확정된다.
  if (kstToday === null) return pastLabel;

  const close = OVERSEAS_INDEX_CLOSE_LOCAL[code];
  const localInstant = new TZDate(
    y,
    mo,
    d,
    Number(close.slice(0, 2)),
    Number(close.slice(2, 4)),
    0,
    OVERSEAS_INDEX_TIMEZONE[code],
  );
  if (Number.isNaN(localInstant.getTime())) return null;

  const kstInstant = localInstant.withTimeZone(KST_ZONE);
  return format(kstInstant, "yyyy-MM-dd") === kstToday
    ? `장 마감 · ${format(kstInstant, "HH:mm")}`
    : pastLabel;
};
