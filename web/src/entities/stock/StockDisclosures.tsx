import type { DartDisclosure } from "@/shared/types/stock";
import { getCorpCode } from "@/lib/stocks";
import { getDisclosures } from "@/lib/dart";
import { formatDartDate } from "@/shared/format";
import { StockPanel } from "./StockPanel";

type DisclosureItemProps = {
  disclosure: DartDisclosure;
};

const DisclosureItem = ({ disclosure }: DisclosureItemProps) => (
  <li className="border-b py-3 last:border-0">
    <a
      href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.rcpNo}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <p className="text-xs text-muted-foreground">
        {formatDartDate(disclosure.rcptDt)}
        {disclosure.flrNm && <span className="ml-2">{disclosure.flrNm}</span>}
        {disclosure.rmk && (
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">{disclosure.rmk}</span>
        )}
      </p>
      <p className="mt-0.5 text-sm font-medium group-hover:underline">{disclosure.disclosureNm}</p>
    </a>
  </li>
);

type StockDisclosuresProps = {
  ticker: string;
};

export const StockDisclosures = async ({ ticker }: StockDisclosuresProps) => {
  let disclosures: DartDisclosure[] = [];
  let noApiKey = false;

  try {
    if (!process.env.DART_API_KEY) {
      noApiKey = true;
    } else {
      const corpCode = await getCorpCode(ticker);
      if (corpCode) {
        disclosures = await getDisclosures(corpCode, 10);
      }
    }
  } catch {
    // API 오류 시 빈 데이터로 폴백
  }

  return (
    <StockPanel variant="disclosures">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">최근 공시 (최근 3개월)</h2>
      {noApiKey ? (
        <p className="text-sm text-muted-foreground">
          DART API 키 미설정 — 공시 데이터를 불러올 수 없습니다
        </p>
      ) : disclosures.length === 0 ? (
        <p className="text-sm text-muted-foreground">최근 공시 없음</p>
      ) : (
        <ul>
          {disclosures.map((d) => (
            <DisclosureItem key={d.rcpNo} disclosure={d} />
          ))}
        </ul>
      )}
    </StockPanel>
  );
};
