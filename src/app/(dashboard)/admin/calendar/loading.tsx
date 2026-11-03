import { PageHeaderSkeleton } from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The fleet calendar while its months load: the legend, then the timeline —
 * a sticky name column and a row per car, at the timeline's own height and
 * full bleed, like the page.
 */
export default function CalendarLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-3 w-20" />
        ))}
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="bg-card max-h-[68vh] overflow-hidden border-y [--name-w:7.5rem] sm:[--name-w:12.5rem]">
        <div className="flex border-b">
          <div className="w-(--name-w) shrink-0 border-r" />
          <Skeleton className="m-2 h-3 flex-1 opacity-60" />
        </div>
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="flex h-12 items-center border-b">
            <div className="w-(--name-w) shrink-0 border-r px-3">
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <div className="relative h-full flex-1">
              <Skeleton
                className="absolute top-3 h-6"
                style={{
                  left: `${(index * 17) % 60}%`,
                  width: `${12 + ((index * 7) % 18)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
