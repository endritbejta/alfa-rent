import { Skeleton } from "@/components/ui/skeleton";
import { BandHeaderSkeleton } from "@/components/shared/skeletons";

/**
 * Contact renders fast, but without its own fallback a slow navigation
 * showed the home page's hero in its place. Same band and two columns.
 */
export default function ContactLoading() {
  return (
    <div aria-busy="true">
      <BandHeaderSkeleton />
      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-6 sm:gap-6 sm:py-14 lg:grid-cols-[1.35fr_.65fr]">
        <div className="border-t pt-6 sm:pt-8">
          <Skeleton className="h-3 w-24" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="mt-7 h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-64 lg:h-auto" />
      </section>
    </div>
  );
}
