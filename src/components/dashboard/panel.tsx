import { cn } from "@/lib/utils";

/** Titled surface every dashboard widget lives in — one rhythm everywhere. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-card rounded-xl border p-5 shadow-xs", className)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold">{title}</h2>
          {subtitle && (
            <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
