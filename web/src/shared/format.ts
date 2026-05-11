export const formatPrice = (price: number): string => price.toLocaleString("ko-KR") + "원";

export const formatVolume = (volume: number): string => volume.toLocaleString("ko-KR") + "주";

export const formatMarketCap = (value: number | null): string => {
  if (value === null) return "-";
  const trillion = value / 1_000_000_000_000;
  if (trillion >= 1) return trillion.toFixed(2) + "조원";
  const billion = value / 100_000_000;
  return Math.round(billion).toLocaleString("ko-KR") + "억원";
};

// 재무 수치 (원 단위 → 억원 표시)
export const formatFinancial = (value: number | null, withUnit = true): string => {
  if (value === null) return "—";
  const num = Math.round(value / 100_000_000).toLocaleString("ko-KR");
  return withUnit ? num + "억원" : num;
};

export const formatRatio = (value: number | null, digits = 2, withUnit = true): string => {
  if (value === null) return "—";
  return withUnit ? value.toFixed(digits) + "배" : value.toFixed(digits);
};

export const formatEps = (value: number | null, withUnit = true): string => {
  if (value === null) return "—";
  const num = value.toLocaleString("ko-KR");
  return withUnit ? num + "원" : num;
};

export const formatPercent = (value: number | null, withUnit = true): string => {
  if (value === null) return "—";
  const num = (value * 100).toFixed(2);
  return withUnit ? num + "%" : num;
};

// 'YYYYMMDD' → 'YYYY.MM.DD'
export const formatDartDate = (yyyymmdd: string): string => {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
};
