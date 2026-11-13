import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  preload = false,
}: {
  className?: string;
  preload?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-2 font-bold tracking-tight",
        className
      )}
    >
      <BrandMark preload={preload} />
      <span>
        ALFA <span className="text-brand">RENT</span>
      </span>
    </span>
  );
}

/** The red "A" on its own, for places where the wordmark is already said. */
export function BrandMark({
  className,
  preload = false,
}: {
  className?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src="/brand/alfa-logo-red.png"
      alt=""
      aria-hidden="true"
      width={226}
      height={223}
      // A 4 KB local PNG. The project's loader only resizes Cloudinary
      // URLs and returns this one untouched, which Next flagged on every
      // page as a loader that ignores width; say so explicitly instead.
      unoptimized
      preload={preload}
      className={cn("h-8 w-8 shrink-0 object-contain", className)}
    />
  );
}
