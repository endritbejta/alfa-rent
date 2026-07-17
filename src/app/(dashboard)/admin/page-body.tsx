import { cn } from "@/lib/utils";

/**
 * The content ceiling, as an opt-in wrapper instead of a shell-wide clamp.
 *
 * P2 put a 1440px cap around every admin page inside the shell. The
 * signature calendar (C6) needs full bleed, and a parent max-width can't be
 * escaped by one child — so the ceiling moves here. Seven pages opt in; the
 * calendar renders straight into the padded main and gets the whole width.
 *
 * Carries the page rhythm (`space-y-6`) too, so a page's root is one wrapper
 * rather than a clamp nested around a spacing div.
 */
export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1440px] space-y-6", className)}>
      {children}
    </div>
  );
}
