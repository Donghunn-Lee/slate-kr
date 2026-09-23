import type { StockQuote } from "@/shared/types/quote";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import type { KrxSession, QuoteMarket } from "@/shared/utils/market";
import {
  NXT_AFTER_MARKET_START_MINUTES,
  NXT_REGULAR_END_MINUTES,
  formatMonthDay,
  isKrxBeforeMarketOpen,
  isKrxOpeningWindow,
} from "@/shared/utils/market";

// 정규장 개장 전 KRX 기준 0% 리셋 창 — 지수 표면과 같은 08:00~09:00.
// 06:00~08:00 은 KRX 기준가가 아직 전일 축이라 리셋 대상이 아니다.
// 리셋 여부는 탭 축으로 가른다 — KRX 축은 창 전체 리셋, NXT 탭은 창 전체 보존.
// 창을 둘로 쪼개지 않는 이유: NXT 탭은 pre(08:00~08:50) 실거래 · 늦은 preopen(08:50~09:00)
// 08:50 종가로 두 구간 모두 표시할 오늘 값이 있다.
// live 유무는 축이 아니다 — 종목 단위라 NXT 상장 종목의 KRX 탭까지 리셋에서 빼고,
// quote_snapshots 행 유무에도 흔들린다.
// now=null(SSR·첫 렌더)은 false — 클라 시계가 서기 전엔 창 판정을 하지 않는다.
// 세션 게이트를 앞에 두는 이유: isKrxOpeningWindow 의 늦은 preopen 항은 세션을 보지
// 않고 클라 시계만 본다. preopen 구간엔 폴링이 멈춰 서버 세션이 전날 저녁 값으로 남을
// 수 있고, 그 조합에서 isClosedLikeMiss 와 동시에 true 가 되면 값·라벨이 어긋난다.
export const isPreMarketReset = (
  session: KrxSession | undefined,
  market: QuoteMarket,
  now: Date | null,
  calendar?: MarketCalendar,
): boolean =>
  now !== null &&
  market !== "nxt" &&
  isKrxBeforeMarketOpen(session) &&
  isKrxOpeningWindow(session, now, calendar);

// after 계열 + closed 의 KRX-only 폴백 창 — 직전 거래일 값 보존 (라벨은 SSR 행 축, ssrRowLabel).
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
  // undefined = 미지정 경로(토글 없는 종목). 세션 결정 채널이라 라이브 축은 NXT 탭과 같지만
  // 종목의 유일 시장이 KRX 라 애프터마켓 경계는 KRX 탭(16:00)을 따른다.
  market: QuoteMarket | undefined;
  // null 이면 표시 값이 SSR 행 — closedLike·KIS 실패·쿼리 비활성 어느 쪽이든 라벨은 같은 축.
  live: StockQuote | null;
  initialDate: string | null; // SSR daily_prices 최신 행 date ('YYYY-MM-DD')
  kstToday: string; // 클라 시계 KST 오늘 ('YYYY-MM-DD')
  updatedAtText: string; // TanStack dataUpdatedAt HH:mm:ss
  // 개장 전 창(08:00~09:00) 여부. preopen 세션은 06:00~08:00 도 포함하므로
  // 세션만으로는 두 창을 가를 수 없다.
  openingWindow: boolean;
  // KRX 애프터마켓(16:00~) 진입 여부. after 세션은 15:30 부터라 세션만으로는 KRX 무체결
  // 구간(15:30~16:00)을 가를 수 없다. 클라 시계 판정 — openingWindow 와 같은 축.
  krxAfterMarketOpen: boolean;
  // 클라 시계 KST 분(0~1439). NXT 탭의 정규장 마감(15:20)·애프터마켓 개시(15:40) 라벨 경계
  // 전용 — 세션은 KRX 축(15:30) 하나라 regular/after 안의 NXT 경계 둘은 이 분 값으로만 가른다.
  // openingWindow·krxAfterMarketOpen 과 같은 클라 시계 축.
  kstMinutes: number;
};

export type HeaderLabelResult = {
  labelText: string;
  timeText: string;
};

// 표시 값이 SSR 행(initialPrice)일 때의 라벨. daily_prices.close 는 20:00 마감 캔들이라 행 날짜가
// 마지막 마감일이면 애프터마켓 마감 축, 뒤처지면(EOD 미적재 창) 직전 거래일 종가 표기.
// 날짜를 모르는 행(initialDate=null)은 캔들 축만 남기고 시각을 비운다.
const ssrRowLabel = (initialDate: string | null, kstToday: string): HeaderLabelResult => {
  if (initialDate === null) return { labelText: "애프터마켓 마감", timeText: "" };
  if (initialDate === kstToday) return { labelText: "애프터마켓 마감", timeText: "20:00" };
  // 직전 거래일 종가 표기
  return { labelText: "전일 종가", timeText: formatMonthDay(initialDate) };
};

// 종목 헤더 세션 라벨/시각 결정. 라벨 단어는 네이버 증권 구간표를 따른다 —
// 개장전 / 프리마켓 / 프리마켓 마감 / 정규장 / 정규장 마감 / 애프터마켓 / 애프터마켓 마감.
// 라이브가 있으면 세션·클라 시계로 구간 라벨, 없으면 표시 값이 SSR 행이라 행 날짜 라벨(ssrRowLabel).
// regular·pre·늦은 preopen 의 라이브 부재만 세션 라벨을 유지한다 — 값이 리셋(개장전)이거나
// 실패 배지가 따로 붙는 구간이다.
// 미지정 경로만 after 에 16:00 경계를 더 얹고, NXT 탭만 15:20·15:40·08:50 경계를 본다.
export const computeHeaderLabel = ({
  session,
  market,
  live,
  initialDate,
  kstToday,
  updatedAtText,
  openingWindow,
  krxAfterMarketOpen,
  kstMinutes,
}: HeaderLabelInput): HeaderLabelResult => {
  if (market === "krx") {
    // 개장 전 창(08:00~09:00) 은 KRX 기준가가 이미 오늘 거래일로 리셋된 구간 — 표시 값도
    // 0 으로 리셋되므로 라벨이 전일 마감 축에 남으면 값·라벨이 어긋난다.
    // 세션보다 창을 앞세운다: 창은 벽시계 사실이고, 이 구간의 KRX 탭 session 은 쿼리가
    // 꺼져 undefined 이거나 직전 세션 응답으로 stale 할 수 있다.
    if (openingWindow) return { labelText: "개장전", timeText: "" };
    if (session === "regular") {
      return { labelText: "정규장", timeText: updatedAtText };
    }
    // 애프터 계열 라이브 — NXT 탭과 같은 축의 라벨. J 채널은 15:30~16:00 에도 마감가를
    // 돌려주므로 라이브 유무가 아니라 16:00 경계가 "애프터마켓" 표기를 가른다.
    if (live !== null) {
      if (session === "after") {
        return krxAfterMarketOpen
          ? { labelText: "애프터마켓", timeText: updatedAtText }
          : { labelText: "정규장 마감", timeText: "15:30" };
      }
      if (session === "after_close" || session === "closed") {
        return { labelText: "애프터마켓 마감", timeText: "20:00" };
      }
    }
    // 라이브 없는 비-regular KRX 탭 (지연 창 fetch 성공은 initialDate 격상으로 같은 축).
    return ssrRowLabel(initialDate, kstToday);
  }

  // NXT 탭 · 미지정 경로. 표시 값 계산의 preReset 은 컴포넌트 소관.
  const isNxtTab = market === "nxt";
  const latePreopen = session === "preopen" && openingWindow;
  const earlyPreopen = session === "preopen" && !openingWindow;

  // 마감 계열(after·after_close·closed)·이른 preopen·응답 전에 live 가 없으면 closedLike 든
  // KIS 실패든 컴포넌트가 initialPrice 를 쓴다 — 라벨도 SSR 행을 따른다. 실패 신호는
  // "일시 지연" 배지가 따로 나르므로 세션 라벨을 붙잡아 둘 이유가 없다.
  if (live === null && session !== "regular" && session !== "pre" && !latePreopen) {
    return ssrRowLabel(initialDate, kstToday);
  }

  // 미지정 경로의 after 라이브는 UN 통합가 — 비NXT 종목은 KRX 애프터마켓 개시(16:00) 전까지
  // 마감가 그대로라 "애프터마켓" 이 사실과 어긋난다. 값은 그대로 두고 라벨만 마감 축으로 —
  // live 를 죽이면 EOD 미적재 창에서 표시 값이 전일로 퇴행한다.
  const beforeKrxAfterMarket =
    market === undefined && session === "after" && !krxAfterMarketOpen;
  // NXT 탭의 정규장 마감 구간(15:20~15:40). 세션은 15:30 에서 regular→after 로 바뀌지만
  // NXT 는 15:20 에 정규장을 닫고 15:40 에 애프터마켓을 연다 — regular 의 뒤 10분과 after 의
  // 앞 10분을 한 라벨로 묶는다. 값 소스는 그대로(regular=NX 정규장 · after=NX 애프터).
  const nxtRegularClosing =
    isNxtTab &&
    ((session === "regular" && kstMinutes >= NXT_REGULAR_END_MINUTES) ||
      (session === "after" && kstMinutes < NXT_AFTER_MARKET_START_MINUTES));
  // 늦은 preopen(08:50~09:00)의 NXT 탭은 08:50 프리마켓 종가가 있는 "프리마켓 마감".
  // 미지정 경로(비NXT 종목)는 프리마켓이 없어 "개장전" 으로 둔다.
  // 이른 preopen(06:00~08:00)의 라이브는 스냅샷(20:00 종가)이라 after_close 와 같은 축 —
  // 07:10 개장전 경계는 두지 않고 08:00 초기화 축 하나만 쓴다.
  const nxtPreClose = isNxtTab && latePreopen && live !== null;

  const labelText =
    session === "regular"
      ? nxtRegularClosing
        ? "정규장 마감"
        : "정규장"
      : session === "after"
        ? beforeKrxAfterMarket || nxtRegularClosing
          ? "정규장 마감"
          : "애프터마켓"
        : session === "after_close" || session === "closed" || earlyPreopen
          ? "애프터마켓 마감"
          : session === "pre"
            ? live === null
              ? "개장전"
              : "프리마켓"
            : nxtPreClose
              ? "프리마켓 마감"
              : "개장전";

  let timeText = "";
  if (live !== null) {
    if (beforeKrxAfterMarket) {
      timeText = "15:30";
    } else if (nxtRegularClosing) {
      timeText = "15:20";
    } else if (session === "regular" || session === "after" || session === "pre") {
      timeText = updatedAtText;
    } else if (session === "after_close" || session === "closed" || earlyPreopen) {
      timeText = "20:00";
    } else if (nxtPreClose) {
      timeText = "08:50";
    }
  }
  // live 없는 regular·pre·늦은 preopen 은 timeText = "" 유지.

  return { labelText, timeText };
};
