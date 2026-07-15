import Link from "next/link";
import Image from "next/image";
import type { VehicleWithImages } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

/**
 * The flagship component from the design system: 16:10 image with year
 * chip + status, category eyebrow, display-weight name, pill spec chips,
 * price and one action in the footer. Shared by website and admin.
 */
export function VehicleCard({ vehicle }: { vehicle: VehicleWithImages }) {
  const cover = vehicle.images[0];

  return (
    <article className="bg-card group overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
      <Link
        href={`/car/${vehicle.slug}`}
        className="relative block aspect-[16/10] bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800"
      >
        {cover ? (
          <Image
            src={cover.url}
            alt={`${vehicle.brand} ${vehicle.model}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] text-neutral-500 uppercase">
            {vehicle.brand}
          </span>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-semibold text-neutral-100 backdrop-blur-sm">
          {vehicle.year}
        </span>
        <span className="absolute top-3 right-3">
          <StatusBadge status={vehicle.status} />
        </span>
      </Link>

      <div className="p-5">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {vehicle.category.toLowerCase()}
        </p>
        <h3 className="font-display mt-0.5 text-lg font-bold">
          {vehicle.brand} {vehicle.model}
        </h3>
        <div className="mt-2.5 mb-4 flex flex-wrap gap-1.5">
          <span className="bg-secondary rounded-full border px-2.5 py-0.5 text-xs">
            {vehicle.transmission === "AUTOMATIC" ? "Automatic" : "Manual"}
          </span>
          <span className="bg-secondary rounded-full border px-2.5 py-0.5 text-xs">
            {vehicle.fuelType.charAt(0) +
              vehicle.fuelType.slice(1).toLowerCase()}
          </span>
          <span className="bg-secondary rounded-full border px-2.5 py-0.5 text-xs">
            {vehicle.seats} seats
          </span>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="font-display text-xl font-bold">
            {Number(vehicle.pricePerDay)}
            <span className="text-muted-foreground font-sans text-xs font-medium">
              {" "}
              EUR / day
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/car/${vehicle.slug}`} />}
          >
            Details
          </Button>
        </div>
      </div>
    </article>
  );
}
