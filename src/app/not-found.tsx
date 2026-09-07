import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Root 404. Reached by `notFound()` from an unknown vehicle slug, and by
 * any mistyped URL — both deserve a way onward rather than a dead end.
 */
export default function NotFound() {
  return (
    <section className="bg-band text-band-foreground flex min-h-screen items-center">
      <div className="mx-auto max-w-lg px-5 text-center">
        <span className="eyebrow text-band-muted">404</span>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight">
          We couldn&apos;t find that page
        </h1>
        <p className="text-band-muted mt-3 text-sm">
          The vehicle may have been retired, or the link may be out of date.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            className="border-band-border text-band-foreground hover:border-band-muted hover:text-band-foreground bg-transparent hover:bg-white/10"
            render={<Link href="/" />}
          >
            Back home
          </Button>
          <Button nativeButton={false} render={<Link href="/car" />}>
            Browse the fleet
          </Button>
        </div>
      </div>
    </section>
  );
}
