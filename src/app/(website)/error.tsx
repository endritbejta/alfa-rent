"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Keeps a failed public page inside the brand instead of a stack trace. */
export default function WebsiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Website route error:", error);
  }, [error]);

  return (
    <section className="bg-band text-band-foreground flex min-h-[70vh] items-center">
      <div className="mx-auto max-w-lg px-5 text-center">
        <span className="eyebrow text-band-muted">Something went wrong</span>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight">
          This page didn&apos;t load
        </h1>
        <p className="text-band-muted mt-3 text-sm">
          Sorry — that&apos;s on us, not you. Try again, or call us on{" "}
          <span className="text-band-foreground">+383 44 000 000</span> and
          we&apos;ll sort your booking out directly.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            className="border-band-border text-band-foreground hover:bg-white/10"
            render={<Link href="/" />}
          >
            Back home
          </Button>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </section>
  );
}
