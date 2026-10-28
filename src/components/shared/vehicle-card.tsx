import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { PublicVehicle } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { getI18n } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/money";
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
 * Editorial vehicle row: photograph on one side, name, specification
 * columns and price on the other, separated from its neighbours by a
 * hairline rather than a container. `query` carries the hero's
 * date/category selection through to the detail page.
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
  const { locale, t } = await getI18n();
  const cover = vehicle.images[0];
  const detailHref = `/car/${vehicle.slug}${query ? `?${query}` : ""}`;
  const bookingParams = new URLSearchParams(query);
  bookingParams.set("vehicle", vehicle.slug);
  const bookingHref = `/booking?${bookingParams.toString()}`;
  const primaryHref = bookingReady ? bookingHref : detailHref;

  const specs = [
    {
      label:
        vehicle.transmission === "AUTOMATIC"
          ? t("vehicle.automatic")
          : t("vehicle.manual"),
    },
    { label: t(FUEL_KEYS[vehicle.fuelType]) },
    { label: t("vehicle.seats", { count: vehicle.seats }) },
  ];

  return (
    <article className="fleet-card group grid gap-5 py-8 first:pt-0 md:grid-cols-12 md:items-center md:gap-10 md:py-10">
      <Link
        href={detailHref}
        tabIndex={-1}
        aria-hidden="true"
        className="bg-media relative block aspect-[16/10] overflow-hidden md:col-span-7"
      >
        {cover ? (
          <Image
            src={cover.url}
            alt=""
            fill
            preload={preload}
            sizes="(max-width: 768px) 100vw, 58vw"
            className="vehicle-cover object-cover transition-transform duration-500 ease-[var(--ease-standard)] motion-reduce:transition-none"
          />
        ) : (
          <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.22em] uppercase">
            {vehicle.brand}
          </span>
        )}
      </Link>

      <div className="md:col-span-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.2em] uppercase">
            {t(CATEGORY_KEYS[vehicle.category])}
          </p>
          <StatusBadge status={vehicle.status} />
        </div>
        <h3 className="mt-3 text-3xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-4xl">
          <Link href={detailHref} className="link-rule">
            {vehicle.brand} {vehicle.model}
          </Link>
        </h3>
        <ul className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {specs.map(({ label }) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="mt-6 flex items-end justify-between gap-4 border-t pt-5">
          <p className="font-display text-2xl font-semibold tabular-nums">
            {formatPrice(vehicle.pricePerDay, locale)}
            <span className="text-muted-foreground font-sans text-xs font-normal">
              {" "}
              EUR / {t("common.perDay")}
            </span>
          </p>
          <Link
            href={primaryHref}
            className="group/cta inline-flex min-h-11 items-center gap-2 text-sm font-medium"
          >
            <span className="link-rule">
              {t(bookingReady ? "common.bookNow" : "vehicle.details")}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform duration-[var(--motion-hover)] group-hover/cta:translate-x-1 motion-reduce:transition-none" />
          </Link>
        </div>
      </div>
    </article>
  );
}
