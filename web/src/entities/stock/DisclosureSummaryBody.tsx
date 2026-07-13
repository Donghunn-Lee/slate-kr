import type { DisclosureSummaryContent } from "@/shared/types/disclosureSummary";

type DisclosureSummaryBodyProps = {
  content: DisclosureSummaryContent;
};

export const DisclosureSummaryBody = ({ content }: DisclosureSummaryBodyProps) => {
  const { headline, facts, detail } = content;

  return (
    <div className="space-y-3">
      <p className="text-base font-semibold leading-snug">{headline}</p>

      {facts.length > 0 && (
        <dl className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1">
          {facts.map((fact, i) => (
            <div key={i} className="flex flex-col gap-0.5 sm:contents">
              <dt className="text-[11px] text-muted-foreground sm:whitespace-nowrap sm:text-sm">
                {fact.label}
              </dt>
              <dd className="break-keep text-xs tabular-nums sm:text-sm">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {detail !== "" && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail}</p>
      )}
    </div>
  );
};
