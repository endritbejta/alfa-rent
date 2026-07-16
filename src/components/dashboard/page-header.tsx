export function PageHeader({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  /** Open-work counter rendered beside the title. */
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="bg-brand rounded-full px-2.5 py-0.5 text-sm font-bold text-white tabular-nums">
              {count}
            </span>
          )}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
