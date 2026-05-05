import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Consistent page title block for logged-in views (matches Today / premium shell). */
export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-3 mb-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-primary">
            {Icon && <Icon className="w-4 h-4 shrink-0 opacity-90" />}
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">{eyebrow}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight font-sans">{title}</h1>
          {description && (
            <div className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{description}</div>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}
