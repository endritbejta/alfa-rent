import { PageBody } from "../page-body";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The vehicle editor while it loads: the sticky action bar, the photo grid
 * with its double-size cover tile, then the two columns of spec cards with
 * their labelled fields — the layout VehicleForm renders, so the form
 * replaces it without anything moving.
 */
export function VehicleFormSkeleton() {
  return (
    <PageBody aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-1.5 h-3.5 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <section className="border-t">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-5">
          <Skeleton className="col-span-2 row-span-2 aspect-square" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="aspect-square" />
          ))}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {Array.from({ length: 2 }, (_, card) => (
          <section key={card} className="border-t pt-4">
            <Skeleton className="mb-4 h-4 w-32" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, field) => (
                <div key={field} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-12" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageBody>
  );
}
