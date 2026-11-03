import { Skeleton } from "@/components/ui/skeleton";
import { BandHeaderSkeleton } from "@/components/shared/skeletons";

/**
 * The booking page while the car and its calendar load: the short band, the
 * two numbered form sections and the summary rail, laid out on the form's
 * own grid.
 */
export default function BookingLoading() {
  return (
    <div aria-busy="true">
      <BandHeaderSkeleton />
      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-10">
        <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <div className="space-y-8">
            {Array.from({ length: 2 }, (_, section) => (
              <div key={section} className="pt-2 sm:pt-4">
                <div className="flex gap-3">
                  <Skeleton className="h-7 w-7 sm:h-8 sm:w-8" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4">
                  {Array.from({ length: 4 }, (_, field) => (
                    <div key={field} className="space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-12" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-4 hidden aspect-[16/9] lg:block" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-4 h-6 w-full" />
            <Skeleton className="mt-5 h-14 w-full" />
          </div>
        </div>
      </section>
    </div>
  );
}
