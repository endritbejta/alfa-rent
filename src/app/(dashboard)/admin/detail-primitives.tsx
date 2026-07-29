/** Shared building blocks so every detail drawer reads the same way. */

export function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h3 className="text-muted-foreground mb-2.5 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase">
      <Icon className="text-brand h-3.5 w-3.5" />
      {children}
    </h3>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-skeleton h-16 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}
