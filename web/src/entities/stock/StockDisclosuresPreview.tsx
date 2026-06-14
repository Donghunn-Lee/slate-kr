import Link from "next/link";
import type { DartDisclosure } from "@/shared/types/stock";
import { getCorpCode } from "@/lib/stocks";
import { getDisclosures } from "@/lib/dart";
import { classifyDisclosure } from "@/shared/utils/classifyDisclosure";
import { formatDartDate } from "@/shared/format";
import { DisclosureAIHint } from "./DisclosureAIHint";
import { StockPanel } from "./StockPanel";
import { CheckpointBadge } from "./CheckpointBadge";

type StockDisclosuresPreviewProps = {
  ticker: string;
};

export const StockDisclosuresPreview = async ({ ticker }: StockDisclosuresPreviewProps) => {
  let disclosures: DartDisclosure[] = [];
  let noApiKey = false;
  let hasError = false;

  try {
    if (!process.env.DART_API_KEY) {
      noApiKey = true;
    } else {
      const corpCode = await getCorpCode(ticker);
      if (corpCode) {
        const bgnDate = new Date();
        bgnDate.setMonth(bgnDate.getMonth() - 3);
        const result = await getDisclosures(corpCode, { pageCount: 5, bgnDate });
        disclosures = result.items;
      }
    }
  } catch {
    hasError = true;
  }

  return (
    <StockPanel variant="sky">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">최근 공시</h2>
        <div className="relative">
          <div className="absolute right-0 top-[-18px]">
            <DisclosureAIHint />
          </div>
          <Link
            href={`/stocks/${ticker}/disclosures`}
            className="text-xs text-muted-foreground hover:underline"
          >
            전체 보기 →
          </Link>
        </div>
      </div>
      {noApiKey ? (
        <p className="text-sm text-muted-foreground">
          DART API 키 미설정 — 공시 데이터를 불러올 수 없습니다
        </p>
      ) : hasError ? (
        <p className="text-sm text-muted-foreground">공시를 불러오지 못했습니다</p>
      ) : disclosures.length === 0 ? (
        <p className="text-sm text-muted-foreground">최근 공시 없음</p>
      ) : (
        <ul>
          {disclosures.map((d) => {
            const type = classifyDisclosure(d.disclosureNm);
            return (
              <li
                key={d.rcpNo}
                className="-mx-6 border-b border-sky-border px-6 py-2 last:border-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcpNo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-start gap-2"
                  >
                    {type && <CheckpointBadge type={type} />}
                    <p className="text-xs self-center font-medium">{d.disclosureNm}</p>
                  </a>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatDartDate(d.rcptDt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </StockPanel>
  );
};
