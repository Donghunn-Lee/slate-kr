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
        <dl className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0">
          {facts.map((fact, i) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 sm:col-span-2 sm:grid sm:grid-cols-subgrid sm:border-b sm:border-sky-border/30 sm:py-1.5 sm:last:border-b-0"
            >
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
