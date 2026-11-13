import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { PublicVehicle } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { getI18n } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/money";
import { placeholderStyle } from "@/lib/cloudinary/image-loader";
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
 * Vehicle card: photograph, then name, specification columns and price,
 * open on the page with no container. `query` carries the hero's
 * date/category selection through to the detail page.
 *
 * Grouping comes from spacing alone. The price used to sit under a hairline,
 * about as far from its own specs as from the next car's photo, so on a
 * phone nobody could tell which car it belonged to. Now everything inside a
 * card is close together (no rule between specs and price), and the grid
 * gap between cards is several times larger.
 *
 * The whole card is one tap target: the name's link is stretched over it
 * with a pseudo-element, so there is a single link per destination and no
 * nesting. The CTA sits above that layer because, once dates are chosen, it
 * goes to booking rather than to the detail page.
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
    <article
      className="fleet-card group has-[.card-link:focus-visible]:outline-ring relative flex flex-col gap-4 has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-4 md:group-data-[view=one]/fleet:grid md:group-data-[view=one]/fleet:grid-cols-12 md:group-data-[view=one]/fleet:items-center md:group-data-[view=one]/fleet:gap-10 md:group-data-[view=one]/fleet:py-10"
      // Lets the fleet's layout switch move this card rather than redraw it.
      // Inline, with the transition's CSS in FleetView: Turbopack's CSS pass
      // drops view-transition rules from the stylesheet.
      style={{
        viewTransitionName: `fleet-${vehicle.id}`,
        viewTransitionClass: "fleet-card",
      }}
    >
      <div
        className="bg-media relative block aspect-[16/10] overflow-hidden md:group-data-[view=one]/fleet:col-span-7"
        // A blurred preview of this photo holds the frame until it loads.
        style={placeholderStyle(cover?.url)}
      >
        {cover ? (
          <Image
            src={cover.url}
            alt=""
            fill
            preload={preload}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="vehicle-cover object-cover transition-transform duration-500 ease-[var(--ease-standard)] motion-reduce:transition-none"
          />
        ) : (
          <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.22em] uppercase">
            {vehicle.brand}
          </span>
        )}
      </div>

      <div className="md:group-data-[view=one]/fleet:col-span-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.2em] uppercase">
            {t(CATEGORY_KEYS[vehicle.category])}
          </p>
          <StatusBadge status={vehicle.status} />
        </div>
        <h3 className="mt-2 text-2xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-3xl">
          <Link
            href={detailHref}
            className="card-link link-rule outline-none after:absolute after:inset-0"
          >
            {vehicle.brand} {vehicle.model}
          </Link>
        </h3>
        <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {specs.map(({ label }) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="font-display text-2xl font-semibold tabular-nums">
            {formatPrice(vehicle.pricePerDay, locale)}
            <span className="text-muted-foreground font-sans text-xs font-normal">
              {" "}
              EUR / {t("common.perDay")}
            </span>
          </p>
          <Link
            href={primaryHref}
            className="group/cta relative z-10 -my-1.5 inline-flex min-h-11 items-center gap-2 pr-1.5 text-sm font-medium"
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
