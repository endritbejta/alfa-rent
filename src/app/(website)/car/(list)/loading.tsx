import { Skeleton } from "@/components/ui/skeleton";
import {
  PageIntroSkeleton,
  VehicleCardSkeleton,
} from "@/components/shared/skeletons";

/**
 * The fleet page while its results load: the plain heading (this page has no
 * charcoal band), the filter panel on wide screens or the count-and-Filters
 * row on phones, then the default two-column grid of cards.
 *
 * In the (list) group so it wraps only the list. At `car/` it would also
 * wrap every car page, and a full load of one would stream this outline
 * before its own.
 */
export default function FleetLoading() {
  return (
    <div aria-busy="true">
      <PageIntroSkeleton className="pt-8 pb-5 sm:pt-10 sm:pb-6" />
      <section className="mx-auto max-w-6xl px-5 pb-8">
        <div className="mt-4 mb-6 flex items-center justify-between gap-3 border-b pb-4 md:hidden">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-28" />
        </div>
        <div className="hidden space-y-4 border-b pb-4 md:block">
          <div className="flex items-end gap-6">
            <Skeleton className="h-14 flex-1" />
            <Skeleton className="h-11 w-28" />
          </div>
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-20" />
            ))}
          </div>
        </div>
        <div className="mt-4 mb-6 hidden items-center justify-between border-b pb-4 md:flex">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 pb-8 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <VehicleCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
