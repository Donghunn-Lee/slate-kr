import { cache } from "react";
import { format } from "date-fns";
import { pool } from "./db";
import {
  INDEX_END_LABEL_BOUNDARIES,
  fetchIndexIntradayChart,
  fetchIndexMinuteBarsRaw,
  foldPostCloseIndexBars,
  kstToFakeUtcSec,
  toKisDate,
} from "./kis-quote-fetch";
import { fetchOverseasIndexIntradayChart } from "./kis-overseas-quote-fetch";
import type {
  DomesticIndexCode,
  OverseasIntradayCode,
} from "@/shared/constants/indices";
import { getKrxTradingDate } from "@/shared/utils/market";
import { resampleIntradayBars } from "@/shared/utils/resampleIntradayBars";
import { toEndLabelBars } from "@/shared/utils/toEndLabelBars";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";

// quote(FHPUP02100000) · intraday(FHKUP03500200) TR 전용 매핑.
// daily TR(FHKUP03500100) 은 KOSDAQ150=2203 으로 상이 —
// collector/fetch_index_prices.py INDEX_CODE_TO_ISCD 참조 (#097).
const ISCD_BY_INDEX: Record<DomesticIndexCode, string> = {
  KOSPI: "0001",
  KOSDAQ: "1001",
  KOSPI200: "2001",
  KOSDAQ150: "3003",
};

type DailyIndexRow = {
  base_date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  change_rate: number;
  volume: number;
};

const toSnapshot = (indexCode: string, row: DailyIndexRow): IndexDailySnapshot => ({
  indexCode,
  date: format(new Date(row.base_date), "yyyy-MM-dd"),
  open: row.open,
  high: row.high,
  low: row.low,
  close: row.close,
  change: row.change,
  changeRate: row.change_rate,
  volume: row.volume,
});

export const getLatestIndexPrice = cache(
  async (indexCode: string): Promise<IndexDailySnapshot | null> => {
    const [rows] = await pool.query<DailyIndexRow[]>(
      "SELECT base_date, open, high, low, close, change, change_rate, volume FROM index_daily_prices WHERE index_code = $1 ORDER BY base_date DESC LIMIT 1",
      [indexCode]
    );
    if (rows.length === 0) return null;
    return toSnapshot(indexCode, rows[0]);
  }
);

// fake-UTC epoch sec (KST/ET 벽시계를 UTC 로 위장) → 원본 캘린더 YYYY-MM-DD.
// getUTC* 로 위장 컴포넌트를 그대로 복원 — 국내/해외 intraday 봉 timestamp 공용.
const sessionDateFromTimestamp = (sec: number): string => {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// intraday change 계산용 직전 세션 close. sessionDate 는 화면에 그릴 세션의 캘린더
// 날짜 — 벽시계 today 대신 봉 데이터에서 파생해 야간/DST/collector 지연 corner 흡수.
// getLatestIndexPrice 는 오늘자 EOD 를 이미 잡으므로 여기선 별도 쿼리로 base_date <
// sessionDate 로 필터해야 "직전 세션 close" 시맨틱 유지.
// null (신규 지수 등 직전 세션 row 부재) → 소비측이 prevClose=0 로 graceful degrade.
const queryPrevSessionClose = async (
  indexCode: string,
  sessionDate: string,
): Promise<number | null> => {
  const [rows] = await pool.query<{ close: number }[]>(
    "SELECT close FROM index_daily_prices WHERE index_code = $1 AND base_date < $2 ORDER BY base_date DESC LIMIT 1",
    [indexCode, sessionDate],
  );
  return rows.length > 0 ? rows[0].close : null;
};

// 인트라데이(10분봉) 가져와서 직전 세션 close 기준 change/changeRate 채워서 반환.
// prevClose 미도착(신규 지수 등) 이면 change=0 — UI 는 차트만 그릴 거라 영향 없음.
// null = fetch 실패 (route 에서 캐시 evict 판정에 사용), [] = 정상 empty.
export const getIndexIntradayPrices = async (
  indexCode: DomesticIndexCode,
  now: Date = new Date(),
): Promise<IndexIntradaySnapshot[] | null> => {
  const bars = await fetchIndexIntradayChart(ISCD_BY_INDEX[indexCode], now);
  if (bars === null) return null;
  const sessionDate =
    bars.length > 0
      ? sessionDateFromTimestamp(bars[bars.length - 1].timestamp)
      : null;
  const prevClose =
    sessionDate !== null
      ? (await queryPrevSessionClose(indexCode, sessionDate)) ?? 0
      : 0;
  return bars.map((bar) => {
    const change = prevClose > 0 ? bar.close - prevClose : 0;
    const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      indexCode,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      change,
      changeRate,
      volume: bar.volume,
    };
  });
};

// ── 해외지수 intraday (SPX / COMP / NDX) ─────────────────
// 국내와 달리 collector 가 DB(overseas_index_intraday) 에 30분마다 1분봉을 적재하고,
// 여기서는 (a) DB 최근 2일치 read + (b) KIS live 1콜(102봉 창) 을 병합해 반환한다.
// live 우선 dedup — 같은 ts 라면 방금 fetch 한 봉이 더 최신 상태 (KIS 는 확장세션
// 꼬리를 더 늦게 갱신하는 경우가 있어 항상 live 를 신뢰).
// 실패 격리: live 실패 → DB-only degraded, DB 실패 → live-only, 둘 다 실패 → null.
// 반환은 10분봉으로 리샘플 (국내 시각 밀도 대칭 + 페이로드 절감).

const INTRADAY_RESAMPLE_MINUTES = 10;
const INTRADAY_DB_LOOKBACK_DAYS = 2;

type OverseasIntradayRow = {
  ts_str: string; // to_char(ts, 'YYYYMMDDHH24MISS') — 저장 시 ET 로컬 naive 를 그대로 보존
  open: number;
  high: number;
  low: number;
  close: number;
};

const parseTsStrToFakeUtcSec = (tsStr: string): number =>
  Math.floor(
    Date.UTC(
      Number(tsStr.slice(0, 4)),
      Number(tsStr.slice(4, 6)) - 1,
      Number(tsStr.slice(6, 8)),
      Number(tsStr.slice(8, 10)),
      Number(tsStr.slice(10, 12)),
      Number(tsStr.slice(12, 14)),
    ) / 1000,
  );

const readOverseasIntradayFromDb = async (
  indexCode: OverseasIntradayCode,
): Promise<ChartBar[]> => {
  try {
    const [rows] = await pool.query<OverseasIntradayRow[]>(
      `SELECT to_char(ts, 'YYYYMMDDHH24MISS') AS ts_str, open, high, low, close
       FROM overseas_index_intraday
       WHERE index_code = $1
         AND ts >= (now() AT TIME ZONE 'America/New_York')::date - INTERVAL '${INTRADAY_DB_LOOKBACK_DAYS} days'
       ORDER BY ts ASC`,
      [indexCode],
    );
    return rows.map((r) => ({
      time: parseTsStrToFakeUtcSec(r.ts_str),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[indices] overseas intraday DB read failed ${indexCode}: ${message}`);
    return [];
  }
};

// pure — live 우선 dedup 후 ASC 정렬. 테스트 대상.
export const mergeIntradayBars = (
  dbBars: ChartBar[],
  liveBars: ChartBar[],
): ChartBar[] => {
  const merged = new Map<number, ChartBar>();
  for (const b of dbBars) {
    if (typeof b.time === "number") merged.set(b.time, b);
  }
  // live 가 나중에 set 되므로 자동 우선 (같은 key 덮어씀).
  for (const b of liveBars) {
    if (typeof b.time === "number") merged.set(b.time, b);
  }
  return Array.from(merged.values()).sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
};

// useBarVolume=false: KIS 해외 분봉 volume 은 항상 0 이므로 강제 0.
// useBarVolume=true: 봉의 volume 을 그대로 전달 (histogram 오버레이).
export const toIntradaySnapshots = (
  indexCode: string,
  bars: ChartBar[],
  prevClose: number,
  useBarVolume: boolean = false,
): IndexIntradaySnapshot[] =>
  bars.map((bar) => {
    const change = prevClose > 0 ? bar.close - prevClose : 0;
    const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      indexCode,
      timestamp: bar.time as number,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      change,
      changeRate,
      volume: useBarVolume ? bar.volume ?? 0 : 0,
    };
  });

// 반환:
//   null   — DB / live 둘 다 실패
//   [] 또는 배열 — 정상. degraded (한쪽 실패) 도 성공으로 취급.
export const getOverseasIndexIntradayPrices = async (
  indexCode: OverseasIntradayCode,
): Promise<IndexIntradaySnapshot[] | null> => {
  const iscd = indexCode; // 해외 코드는 KIS ISCD 와 그대로 일치 (SPX / COMP / NDX)
  const [dbBars, liveBars] = await Promise.all([
    readOverseasIntradayFromDb(indexCode),
    fetchOverseasIndexIntradayChart(iscd),
  ]);

  const liveFailed = liveBars === null;
  const dbFailed = dbBars.length === 0;
  if (liveFailed && dbFailed) {
    // live 실패 + DB 비어있음(적재 전이거나 read 실패) — 소비측이 실패로 처리.
    return null;
  }

  const merged = mergeIntradayBars(dbBars, liveBars ?? []);
  const resampled = resampleIntradayBars(merged, INTRADAY_RESAMPLE_MINUTES);
  const sessionDate =
    resampled.length > 0
      ? sessionDateFromTimestamp(resampled[resampled.length - 1].time as number)
      : null;
  const prevClose =
    sessionDate !== null
      ? (await queryPrevSessionClose(indexCode, sessionDate)) ?? 0
      : 0;
  return toIntradaySnapshots(indexCode, resampled, prevClose);
};

// ── 국내 지수 1분 (DB + KIS live tail) ─────────────────
// tradingDate 1값으로 DB 필터·live 필터 모두 고정 — 세션·일 경계에서 자연 정합.
// live 호출 게이트 없음.
// 실패 계약: live 실패 + DB 빈 배열 → null (소비측 failed).
// 한쪽만 실패 → degraded 성공 (빈 배열도 정상 응답).

type DomesticIntradayRow = {
  ts_date: string; // to_char(ts, 'YYYYMMDD')
  ts_time: string; // to_char(ts, 'HH24MISS')
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// KST naive `ts` 를 kstToFakeUtcSec 로 fake-UTC epoch 초 인코딩 —
// 라이브 파싱 경로와 동일 축을 보장해 DB↔live 병합 dedup key 정합 유지.
const readDomesticIntradayFromDb = async (
  indexCode: DomesticIndexCode,
  tradingDate: string, // 'YYYY-MM-DD'
): Promise<ChartBar[]> => {
  try {
    const [rows] = await pool.query<DomesticIntradayRow[]>(
      `SELECT to_char(ts, 'YYYYMMDD') AS ts_date,
              to_char(ts, 'HH24MISS') AS ts_time,
              open, high, low, close, volume
         FROM domestic_index_intraday
        WHERE index_code = $1
          AND ts >= $2::date
          AND ts <  ($2::date + INTERVAL '1 day')
        ORDER BY ts ASC`,
      [indexCode, tradingDate],
    );
    return rows.map((r) => ({
      time: kstToFakeUtcSec(r.ts_date, r.ts_time),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[indices] domestic intraday DB read failed ${indexCode}: ${message}`,
    );
    return [];
  }
};

export const getIndexIntraday1mPrices = async (
  indexCode: DomesticIndexCode,
  now: Date = new Date(),
): Promise<IndexIntradaySnapshot[] | null> => {
  const tradingDate = getKrxTradingDate(now);
  const targetDate = toKisDate(tradingDate);
  const iscd = ISCD_BY_INDEX[indexCode];

  const [dbBars, liveBars] = await Promise.all([
    readDomesticIntradayFromDb(indexCode, tradingDate),
    fetchIndexMinuteBarsRaw(iscd, now, 60, targetDate),
  ]);

  const liveFailed = liveBars === null;
  const dbFailed = dbBars.length === 0;
  if (liveFailed && dbFailed) {
    return null;
  }

  const merged = mergeIntradayBars(dbBars, liveBars ?? []);
  const endLabeled = toEndLabelBars(
    foldPostCloseIndexBars(merged),
    60,
    INDEX_END_LABEL_BOUNDARIES,
  );
  const sessionDate =
    endLabeled.length > 0
      ? sessionDateFromTimestamp(endLabeled[endLabeled.length - 1].time as number)
      : null;
  const prevClose =
    sessionDate !== null
      ? (await queryPrevSessionClose(indexCode, sessionDate)) ?? 0
      : 0;
  return toIntradaySnapshots(indexCode, endLabeled, prevClose, true);
};

export const getIndexDailyPrices = async (
  indexCode: string,
  limit = 365
): Promise<IndexDailySnapshot[]> => {
  // 최신 N건을 가져온 뒤 차트가 소비하기 좋게 ASC로 뒤집는다.
  const [rows] = await pool.query<DailyIndexRow[]>(
    "SELECT base_date, open, high, low, close, change, change_rate, volume FROM index_daily_prices WHERE index_code = $1 ORDER BY base_date DESC LIMIT $2",
    [indexCode, limit]
  );
  return rows.reverse().map((row) => toSnapshot(indexCode, row));
};
