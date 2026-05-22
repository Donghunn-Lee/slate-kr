import type { DartDisclosure } from "@/shared/types/stock";
import { getCorpCode } from "@/lib/stocks";
import { getDisclosures } from "@/lib/dart";
import { DisclosuresSection } from "./DisclosuresSection";

type StockDisclosuresProps = {
  ticker: string;
};

export const StockDisclosures = async ({ ticker }: StockDisclosuresProps) => {
  let disclosures: DartDisclosure[] = [];
  let noApiKey = false;
  let hasError = false;

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
    hasError = true;
  }

  return <DisclosuresSection disclosures={disclosures} noApiKey={noApiKey} hasError={hasError} />;
};
