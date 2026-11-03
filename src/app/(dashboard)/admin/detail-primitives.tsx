import { Skeleton } from "@/components/ui/skeleton";

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

/**
 * What a drawer shows while its record loads, in the shape of that record:
 * reservations and vehicles open on a 16:9 photo, customers on three
 * figures, and each continues as titled sections of label–value rows. Five
 * identical grey slabs used to stand in for all three.
 */
export function DrawerSkeleton({
  kind,
}: {
  kind: "reservation" | "vehicle" | "customer";
}) {
  return (
    <div className="space-y-6" aria-busy="true">
      {kind === "customer" ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <Skeleton className="aspect-[16/9] w-full" />
      )}
      {[5, 3].map((rows, section) => (
        <div key={section}>
          <Skeleton className="mb-2.5 h-3 w-28" />
          <div className="space-y-2.5">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
