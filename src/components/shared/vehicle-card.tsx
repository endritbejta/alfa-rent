import Link from "next/link";
import Image from "next/image";
import { Cog, Fuel, Users } from "lucide-react";
import type { VehicleWithImages } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

/**
 * Flagship card. `query` carries the hero's date/category selection through
 * to the detail page so the customer never re-enters their dates.
 */
export function VehicleCard({
  vehicle,
  query,
}: {
  vehicle: VehicleWithImages;
  query?: string;
}) {
  const cover = vehicle.images[0];
  const href = `/car/${vehicle.slug}${query ? `?${query}` : ""}`;

  const pills = [
    {
      icon: Cog,
      label: vehicle.transmission === "AUTOMATIC" ? "Automatic" : "Manual",
    },
    {
      icon: Fuel,
      label:
        vehicle.fuelType.charAt(0) + vehicle.fuelType.slice(1).toLowerCase(),
    },
    { icon: Users, label: `${vehicle.seats} seats` },
  ];

  return (
    <article className="bg-card group overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
      <Link
        href={href}
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
          {pills.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="border-brand/15 bg-brand/[0.06] text-foreground/80 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              <Icon className="text-brand h-3.5 w-3.5" />
              {label}
            </span>
          ))}
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
            className="transition-transform duration-150 hover:scale-[1.04] active:scale-100"
            render={<Link href={href} />}
          >
            Details
          </Button>
        </div>
      </div>
    </article>
  );
}
