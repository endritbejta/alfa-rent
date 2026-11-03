import { Skeleton } from "@/components/ui/skeleton";

/**
 * A car page while it loads: the back link, the gallery at its real 16:10
 * with its thumbnail row, the heading and specification grid, and the
 * booking rail — the same two columns and spacing as the page, so the
 * photo lands exactly where its placeholder was.
 */
export default function VehicleLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto max-w-6xl px-5 pt-2 pb-28 lg:pt-8 lg:pb-12"
    >
      <Skeleton className="mb-1 h-10 w-36 lg:mb-5" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <div>
          <Skeleton className="aspect-[16/10] w-full" />
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="aspect-[16/10]" />
            ))}
          </div>
          <Skeleton className="mt-5 h-3 w-32 lg:mt-10" />
          <Skeleton className="mt-3 h-9 w-2/3 sm:h-11" />
          <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-4 w-5/6 max-w-xl" />
          <div className="mt-6 grid grid-cols-2 gap-x-6 border-t sm:mt-10 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="border-b py-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <Skeleton className="h-9 w-40 sm:h-10" />
          <Skeleton className="mt-2 h-4 w-56" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="mt-3 h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
