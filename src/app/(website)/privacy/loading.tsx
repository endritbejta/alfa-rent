import { Skeleton } from "@/components/ui/skeleton";
import { BandHeaderSkeleton } from "@/components/shared/skeletons";

/**
 * Without its own fallback a slow navigation would show the nearest parent's
 * skeleton, the home page's hero. Same band, then one column of sections.
 */
export default function LegalLoading() {
  return (
    <div aria-busy="true">
      <BandHeaderSkeleton />
      <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:py-14">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 border-t pt-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
