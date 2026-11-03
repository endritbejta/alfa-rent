import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Storefront placeholders, one per shape of page, built from the same
 * containers and spacing as the pages they stand in for.
 *
 * There used to be a single route-group fallback — a charcoal hero band over
 * boxed cards — and every public page wore it while loading. The fleet page
 * has no band and its cards have no box, the car page is a gallery and a
 * booking rail, and the booking page is a form; each flashed a page it was
 * not before turning into itself. Now each loading state is the page's own
 * silhouette, so arriving content settles into place instead of replacing
 * a different layout. Static by design: no shimmer travels across them.
 */

/** Mirrors VehicleCard: photo, category and badge, name, specs, price row. */
export function VehicleCardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="aspect-[16/10] w-full" />
      <div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
        <Skeleton className="mt-3 h-7 w-3/4 sm:h-8" />
        <Skeleton className="mt-4 h-4 w-1/2" />
        <div className="mt-6 flex items-end justify-between gap-4 border-t pt-5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

/** The short charcoal band the booking and contact pages open with. */
export function BandHeaderSkeleton() {
  return (
    <section className="bg-band">
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-6 sm:pt-12 sm:pb-9">
        <Skeleton className="h-3 w-28 bg-white/12" />
        <Skeleton className="mt-4 h-8 w-64 max-w-full bg-white/12 sm:h-9 lg:h-10" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg bg-white/10" />
      </div>
    </section>
  );
}

/** A page heading in the editorial style: eyebrow, display title, intro. */
export function PageIntroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto max-w-6xl px-5", className)}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-12 w-80 max-w-full sm:h-16 sm:w-[28rem]" />
      <Skeleton className="mt-4 h-4 w-full max-w-lg" />
    </div>
  );
}
