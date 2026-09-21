import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
};

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-1 flex-col items-center justify-center">
    {Icon && <Icon className="mb-2 size-5 text-muted-foreground/60" />}
    <p className="text-body font-medium">{title}</p>
    {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
    {action && (
      <Link
        href={action.href}
        className="mt-3 text-body-sm underline underline-offset-4 transition-opacity hover:opacity-70"
      >
        {action.label}
      </Link>
    )}
  </div>
);
