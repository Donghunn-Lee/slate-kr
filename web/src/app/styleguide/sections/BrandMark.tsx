import { Logo } from "@/components/layout/Logo";

export const BrandMark = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Brand
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      위 무채(가격) · peach(핵심 지표) · sky(공시)
    </p>

    <div className="flex flex-wrap items-end gap-8 rounded-md border border-subtle bg-elevated p-6">
      {[96, 48, 24].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Logo size={size} />
          <span className="font-mono text-[11px] text-muted-foreground">{size}px</span>
        </div>
      ))}
    </div>
  </section>
);
