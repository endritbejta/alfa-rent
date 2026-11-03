import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Admin placeholders, cut to the components they stand in for. One generic
 * loading screen — a title bar, five boxes, a slab — used to stand in for
 * all six sections, so the reservations table, the vehicle grid and the
 * calendar each flashed the dashboard's outline first. These share sizes
 * with PageHeader, StatStrip, Panel and the tables, so the real page lands
 * where its placeholder was.
 */

/** PageHeader: title, one line of description, optionally an action. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-8 w-32" />}
    </div>
  );
}

/** StatStrip: label, a large figure, a hint, in the strip's own grid. */
export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 py-2 sm:grid-cols-4 lg:grid-cols-7">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-7 h-8 w-16" />
          <Skeleton className="mt-1.5 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Panel: the hairline, the small-caps title, then whatever it holds. */
export function PanelSkeleton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("border-t pt-5", className)}>
      <Skeleton className="mb-4 h-3 w-32" />
      {children}
    </section>
  );
}

/** The segmented status control that sits above a list. */
export function PillsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-4 border-b pb-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-5 w-20" />
      ))}
    </div>
  );
}

/** Table rows on wide screens, stacked cards on phones — as the lists do. */
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }, (_, index) => (
          <li key={index} className="space-y-2 border-b px-2 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-3.5 w-32" />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Skeleton className="mb-2 h-3 w-full max-w-3xl opacity-60" />
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr] items-center gap-6 border-b py-3.5"
          >
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20 justify-self-end" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}

/** A chart panel's plot area at the chart's height. */
export function ChartSkeleton({ height = 160 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

/** The vehicle grid: photo at 16:10 and the caption block under it. */
export function VehicleGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <Skeleton className="aspect-[16/10] w-full" />
          <div className="space-y-2 border-b py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
