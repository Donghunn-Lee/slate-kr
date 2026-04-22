import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary",
      blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      red: "bg-red-500/10 text-red-600 dark:text-red-400",
      purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
      amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      neutral: "bg-secondary text-secondary-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
