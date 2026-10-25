import type { ChartPalette } from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";

// priceFormatter 미주입 시 legend 값 포맷. precision 을 그대로 사용해 축약 없이 로케일 표기.
export const formatOhlc = (v: number, precision: number): string =>
  v.toLocaleString("ko-KR", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

// legend 거래량 — 단위 없이 천단위 콤마 풀 표기.
const formatLegendVolume = (v: number): string => v.toLocaleString("ko-KR");

// 등락률 %. 부호 포함 소수 2자리. prevClose 없거나 0이면 null.
export const formatChangePct = (close: number, prevClose: number | null): string | null => {
  if (prevClose === null || prevClose === 0) return null;
  const pct = ((close - prevClose) / prevClose) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  return `${sign}${pct.toFixed(2)}%`;
};

// bars[i] 의 범례 등락 기준가. 봉이 basePrice(KRX 기준가) 를 실으면 그것, 없으면 직전 봉
// close. 첫 봉이 기준가도 없으면 null → 등락률 미표시. 최신봉·hover 5곳이 공유.
export const changeBasis = (bars: readonly ChartBar[], i: number): number | null =>
  bars[i].basePrice ?? (i > 0 ? bars[i - 1].close : null);

// legend DOM 갱신. bar=null → 텍스트 비움. 등락색은 CHART_THEME up/down 재사용.
// 숫자 값만 삽입 → XSS 위험 없음.
// candle: 시 고 저 종 [등락률] [거]. 종가색 = 봉 방향(close ≥ open).
// line: 종 [등락률] [거]. 종가색 = 기준가 대비(prevClose = changeBasis 결과).
// 거 는 showVolume 일 때만. candle hover 는 volume series join 이라 pane 이 없으면 자연히
// 비지만, 미호버·line 경로는 바 원본 volume(pane 없는 지수도 0) 을 읽으므로 명시 가드가 필요.
export const paintLegend = (
  el: HTMLDivElement | null,
  bar: ChartBar | null,
  prevClose: number | null,
  palette: ChartPalette,
  formatPrice: (v: number) => string,
  kind: "candle" | "line",
  showVolume: boolean
) => {
  if (!el) return;
  if (!bar) {
    el.innerHTML = "";
    return;
  }
  const labelCls = "text-muted-foreground";
  let closeColor: string | undefined;
  if (kind === "candle") {
    closeColor = bar.close >= bar.open ? palette.up : palette.down;
  } else if (prevClose !== null) {
    closeColor =
      bar.close > prevClose ? palette.up : bar.close < prevClose ? palette.down : undefined;
  }
  const parts: string[] = [];
  if (kind === "candle") {
    parts.push(
      `<span class="${labelCls}">시</span> ${formatPrice(bar.open)}`,
      `<span class="${labelCls}">고</span> ${formatPrice(bar.high)}`,
      `<span class="${labelCls}">저</span> ${formatPrice(bar.low)}`
    );
  }
  const closeSpan = closeColor
    ? `<span style="color:${closeColor}">${formatPrice(bar.close)}</span>`
    : formatPrice(bar.close);
  parts.push(`<span class="${labelCls}">종</span> ${closeSpan}`);
  const pct = formatChangePct(bar.close, prevClose);
  if (pct !== null) {
    // 등락률 색은 부호 기준 (봉 방향과 다를 수 있음: 갭업 후 종가 하락 등).
    const pctColor = pct.startsWith("+")
      ? palette.up
      : pct.startsWith("-")
        ? palette.down
        : undefined;
    parts.push(
      pctColor
        ? `<span style="color:${pctColor}">${pct}</span>`
        : `<span class="${labelCls}">${pct}</span>`
    );
  }
  if (showVolume && bar.volume !== undefined) {
    parts.push(`<span class="${labelCls}">거</span> ${formatLegendVolume(bar.volume)}`);
  }
  // 실제 공백을 품은 span 으로 join — 컨테이너 폭 초과 시 브라우저가 이 지점에서 wrap.
  // margin 은 시각적 gap 유지용. inline-block/w-* 는 wrap candidate 를 제거하므로 회피.
  el.innerHTML = parts.join('<span class="mx-1"> </span>');
};

// MA 범례 — 좌측 "이동평균" 라벨(muted) 뒤에 period 숫자만 표시(라인색).
// 실제로 그려진 period 만 표시(가드로 스킵된 period 는 범례에도 없음).
export const paintMaLegend = (
  el: HTMLDivElement | null,
  drawn: { period: number; colorIdx: number }[],
  palette: ChartPalette
) => {
  if (!el) return;
  if (drawn.length === 0) {
    el.innerHTML = "";
    return;
  }
  const nums = drawn
    .map(
      ({ period, colorIdx }) =>
        `<span style="color:${palette.ma[colorIdx % palette.ma.length]}">${period}</span>`
    )
    .join('<span class="mx-1.5 opacity-30">·</span>');
  el.innerHTML = `<span class="text-muted-foreground mr-1.5">이동평균</span>${nums}`;
};
