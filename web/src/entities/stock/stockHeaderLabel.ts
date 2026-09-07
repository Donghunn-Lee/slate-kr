import type { StockQuote } from "@/shared/types/quote";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import type { KrxSession, QuoteMarket } from "@/shared/utils/market";
import { isKrxBeforeMarketOpen, isKrxOpeningWindow } from "@/shared/utils/market";

// 정규장 개장 전 KRX 기준 0% 리셋 창 — 지수 표면과 같은 08:00~09:00.
// 06:00~08:00 은 KRX 기준가가 아직 전일 축이라 리셋 대상이 아니다.
// live !== null 은 제외: NXT 상장 종목은 08:00~08:50 실거래가 있어 프리마켓 값을 그대로 쓴다.
// (KRX-only 종목은 NX 응답 iscd=null → normalize=null 로 live 가 비어 리셋 경로에 들어온다.)
// now=null(SSR·첫 렌더)은 false — 클라 시계가 서기 전엔 창 판정을 하지 않는다.
// 세션 게이트를 앞에 두는 이유: isKrxOpeningWindow 의 늦은 preopen 항은 세션을 보지
// 않고 클라 시계만 본다. preopen 구간엔 폴링이 멈춰 서버 세션이 전날 저녁 값으로 남을
// 수 있고, 그 조합에서 isClosedLikeMiss 와 동시에 true 가 되면 값·라벨이 어긋난다.
export const isPreMarketReset = (
  session: KrxSession | undefined,
  live: StockQuote | null,
  now: Date | null,
  calendar?: MarketCalendar,
): boolean =>
  now !== null &&
  live === null &&
  isKrxBeforeMarketOpen(session) &&
  isKrxOpeningWindow(session, now, calendar);

// after 계열 + closed 의 KRX-only 폴백 창 — 직전 거래일 값 보존 + "장 마감" 라벨.
// pre 는 isPreMarketReset 이 처리하므로 여기서 제외.
// failed=true(=KIS 실패) 는 정상 NXT 미지원과 구분해야 하므로 !isFailedQuote 로 게이트.
export const isClosedLikeMiss = (
  session: KrxSession | undefined,
  live: StockQuote | null,
  isFailedQuote: boolean,
): boolean =>
  !isFailedQuote &&
  (session === "after" ||
    session === "after_close" ||
    session === "closed") &&
  live === null;

export type HeaderLabelInput = {
  session: KrxSession | undefined;
  market: QuoteMarket;
  live: StockQuote | null;
  isFailedQuote: boolean;
  initialDate: string | null; // SSR daily_prices 최신 행 date ('YYYY-MM-DD')
  kstToday: string; // 클라 시계 KST 오늘 ('YYYY-MM-DD')
  updatedAtText: string; // TanStack dataUpdatedAt HH:mm:ss
  // 개장 전 창(08:00~09:00) 여부. preopen 세션은 06:00~08:00 도 포함하므로
  // 세션만으로는 두 창을 가를 수 없다.
  openingWindow: boolean;
};

export type HeaderLabelResult = {
  labelText: string;
  timeText: string;
};

// 종목 헤더 세션 라벨/시각 결정.
// KRX 탭: regular 는 라이브 라벨, 비-regular 는 initialDate 기준 SSR 라벨.
// NXT 탭: 세션·live·failed 조합으로 확장 세션 라벨(프리마켓/애프터마켓 등) 결정.
export const computeHeaderLabel = ({
  session,
  market,
  live,
  isFailedQuote,
  initialDate,
  kstToday,
  updatedAtText,
  openingWindow,
}: HeaderLabelInput): HeaderLabelResult => {
  if (market === "krx") {
    if (session === "regular") {
      return { labelText: "장중", timeText: updatedAtText };
    }
    // 비-regular KRX 탭 — 라이브 쿼리 비활성이므로 SSR 기반 표기만.
    if (initialDate === null) return { labelText: "장 마감", timeText: "" };
    if (initialDate === kstToday) return { labelText: "장 마감", timeText: "15:30" };
    // "YYYY-MM-DD" → "MM.DD" (직전 거래일 종가 표기)
    const mmdd = `${initialDate.slice(5, 7)}.${initialDate.slice(8, 10)}`;
    return { labelText: "전일 종가", timeText: mmdd };
  }

  // NXT 탭. 표시 값 계산의 preReset 은 컴포넌트 소관.
  const closedLike = isClosedLikeMiss(session, live, isFailedQuote);

  const labelText = closedLike
    ? "장 마감"
    : session === "regular"
      ? "장중"
      : session === "after"
        ? "애프터마켓"
        : session === "after_close" || session === "closed"
          ? "애프터마켓 종가"
          : session === "pre"
            ? live === null
              ? "개장 전"
              : "프리마켓"
            : session === "preopen" && openingWindow
              ? "개장 전"
              : "장 마감";

  let timeText = "";
  if ((session === "regular" || session === "after" || session === "pre") && live !== null) {
    timeText = updatedAtText;
  } else if ((session === "after_close" || session === "closed") && live !== null) {
    timeText = "20:00";
  } else if (closedLike && (session === "after" || session === "after_close")) {
    timeText = "15:30";
  } else if (session === "closed") {
    timeText = "15:30";
  }
  // preReset · pre-live=null · undefined session 등 은 timeText = "" 유지.

  return { labelText, timeText };
};
