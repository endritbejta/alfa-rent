import { Skeleton } from "@/components/ui/skeleton";
import { VehicleCardSkeleton } from "@/components/shared/skeletons";

/**
 * The home page's silhouette: the charcoal hero with the search bar and
 * proof row, then the featured fleet as the editorial cards it really
 * renders — unboxed, in the same grid.
 *
 * It lives in the (home) group, not at the (website) level, because a
 * group-level fallback is streamed first on a full page load of every
 * public route: /car and /contact used to open on this hero for a moment
 * before their own outline arrived. Each public route now carries its own.
 */
export default function WebsiteLoading() {
  return (
    <div aria-busy="true">
      <section className="bg-band">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-14 lg:pt-20 lg:pb-16">
          <Skeleton className="h-3 w-32 bg-white/12" />
          <Skeleton className="mt-5 h-12 w-full max-w-3xl bg-white/12 sm:h-20" />
          <Skeleton className="mt-3 h-12 w-2/3 max-w-2xl bg-white/12 sm:h-20" />
          <Skeleton className="mt-6 h-5 w-full max-w-xl bg-white/10" />
          <Skeleton className="mt-8 h-14 w-full max-w-3xl bg-white/10" />
          <div className="border-band-border mt-10 flex flex-wrap gap-x-10 gap-y-3 border-t pt-6">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-36 bg-white/10" />
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <div className="mb-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-64 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <VehicleCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
