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
      <Image
        src="/brand/alfa-logo-red.png"
        alt=""
        aria-hidden="true"
        width={226}
        height={223}
        preload={preload}
        className="h-8 w-8 shrink-0 object-contain"
      />
      <span>
        ALFA <span className="text-brand">RENT</span>
      </span>
    </span>
  );
}
