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
    <section className={cn("border-t pt-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
            {title}
          </h2>
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
