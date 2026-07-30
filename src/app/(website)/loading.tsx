import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-group fallback: preserves the public page rhythm while server data
 * streams. It is intentionally static—no shimmer or moving gradient under
 * reduced-motion-sensitive users.
 */
export default function WebsiteLoading() {
  return (
    <div aria-busy="true">
      <section className="bg-band">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <Skeleton className="h-3 w-32 bg-white/12" />
          <Skeleton className="mt-5 h-11 w-full max-w-md bg-white/12" />
          <Skeleton className="mt-4 h-5 w-full max-w-lg bg-white/10" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="bg-card overflow-hidden rounded-2xl shadow-sm"
            >
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
