import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Cog, Fuel, Users } from "lucide-react";
import type { PublicVehicle } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

const CATEGORY_KEYS = {
  ECONOMY: "filter.economy",
  COMPACT: "filter.compact",
  SEDAN: "filter.sedan",
  SUV: "filter.suv",
  LUXURY: "filter.luxury",
  VAN: "filter.van",
} satisfies Record<PublicVehicle["category"], TranslationKey>;

const FUEL_KEYS = {
  PETROL: "vehicle.petrol",
  DIESEL: "vehicle.diesel",
  HYBRID: "vehicle.hybrid",
  ELECTRIC: "vehicle.electric",
} satisfies Record<PublicVehicle["fuelType"], TranslationKey>;

/**
 * Flagship card. `query` carries the hero's date/category selection through
 * to the detail page so the customer never re-enters their dates.
 */
export async function VehicleCard({
  vehicle,
  query,
  bookingReady = false,
  preload = false,
}: {
  vehicle: PublicVehicle;
  query?: string;
  bookingReady?: boolean;
  preload?: boolean;
}) {
  const { t } = await getI18n();
  const cover = vehicle.images[0];
  const detailHref = `/car/${vehicle.slug}${query ? `?${query}` : ""}`;
  const bookingParams = new URLSearchParams(query);
  bookingParams.set("vehicle", vehicle.slug);
  const bookingHref = `/booking?${bookingParams.toString()}`;
  const primaryHref = bookingReady ? bookingHref : detailHref;

  const pills = [
    {
      icon: Cog,
      label:
        vehicle.transmission === "AUTOMATIC"
          ? t("vehicle.automatic")
          : t("vehicle.manual"),
    },
    {
      icon: Fuel,
      label: t(FUEL_KEYS[vehicle.fuelType]),
    },
    {
      icon: Users,
      label: t("vehicle.seats", { count: vehicle.seats }),
    },
  ];

  return (
    <article className="fleet-card bg-card group overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={detailHref}
        className="relative block aspect-[16/10] bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800"
      >
        {cover ? (
          <Image
            src={cover.url}
            alt={`${vehicle.brand} ${vehicle.model}`}
            fill
            preload={preload}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="vehicle-cover object-cover transition-transform duration-[var(--motion-hover)] ease-[var(--ease-standard)] motion-reduce:transition-none"
          />
        ) : (
          <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] uppercase">
            {vehicle.brand}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <StatusBadge status={vehicle.status} variant="overlay" />
        </span>
      </Link>

      <div className="p-5">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t(CATEGORY_KEYS[vehicle.category])}
        </p>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-bold">
            {vehicle.brand} {vehicle.model}
          </h3>
        </div>
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
            {vehicle.pricePerDay}
            <span className="text-muted-foreground font-sans text-xs font-medium">
              {" "}
              EUR / {t("common.perDay")}
            </span>
          </p>
          <Button
            size="sm"
            nativeButton={false}
            className="bg-foreground text-background hover:bg-foreground/85 px-4 shadow-sm"
            render={<Link href={primaryHref} />}
          >
            {t(bookingReady ? "common.bookNow" : "vehicle.details")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
