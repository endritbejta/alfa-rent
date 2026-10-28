import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowLeft,
  Users,
  Fuel,
  Settings2,
  CalendarRange,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { getPublicVehicleBySlug } from "@/services/vehicle.service";
import { getVehicleBookingCalendar } from "@/services/reservation.service";
import { NotFoundError } from "@/lib/errors";
import { AvailabilityWidget } from "@/components/forms/availability-widget";
import { MobileBookingBar } from "@/components/forms/mobile-booking-bar";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";
import { getVehicleDescription } from "@/lib/i18n/vehicle-content";
import { isBookingRangeAvailable } from "@/lib/booking-calendar";
import { VehicleGallery } from "./vehicle-gallery";
import { cloudinaryJpegCrop } from "@/lib/cloudinary/image-loader";
import { formatAmount, formatPrice } from "@/lib/money";
import { openGraphLocale } from "@/lib/site-url";

const CATEGORY_KEYS = {
  ECONOMY: "filter.economy",
  COMPACT: "filter.compact",
  SEDAN: "filter.sedan",
  SUV: "filter.suv",
  LUXURY: "filter.luxury",
  VAN: "filter.van",
} as const satisfies Record<string, TranslationKey>;

const FUEL_KEYS = {
  PETROL: "vehicle.petrol",
  DIESEL: "vehicle.diesel",
  HYBRID: "vehicle.hybrid",
  ELECTRIC: "vehicle.electric",
} as const satisfies Record<string, TranslationKey>;

export const dynamic = "force-dynamic";

const loadVehicle = cache(async (slug: string) => {
  try {
    return await getPublicVehicleBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await loadVehicle(slug);
  const { locale, t } = await getI18n();
  const description = getVehicleDescription(vehicle, locale).slice(0, 155);
  const title = t("car.metaTitle", {
    car: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
    price: formatAmount(vehicle.pricePerDay, locale),
  });
  const canonical = `/car/${vehicle.slug}`;
  // Link previews want a 1200x630 JPEG, not the 1920px original.
  const image = cloudinaryJpegCrop(vehicle.images[0]?.url, 1200, 630);
  return {
    title,
    description,
    alternates: { canonical },
    // Replaces the layout's openGraph wholesale, so the shared fields repeat.
    openGraph: {
      type: "website",
      siteName: "Alfa Rent a Car",
      locale: openGraphLocale(locale),
      url: canonical,
      title,
      description,
      // A car without photos falls back to the site's branded image; this
      // object replaces the layout's openGraph, so nothing would inherit it.
      images: [
        image
          ? {
              url: image,
              width: 1200,
              height: 630,
              alt: `${vehicle.brand} ${vehicle.model}`,
            }
          : { url: "/opengraph-image", width: 1200, height: 630 },
      ],
    },
  };
}

export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const { from, to } = await searchParams;
  const { locale, t } = await getI18n();
  const vehicle = await loadVehicle(slug);
  const bookingCalendar = await getVehicleBookingCalendar(vehicle.id);
  const initialRangeAvailable = isBookingRangeAvailable(
    from,
    to,
    bookingCalendar
  );
  const description = getVehicleDescription(vehicle, locale);
  // Back to the fleet with the customer's dates and category still applied.
  const back = new URLSearchParams();
  if (from) back.set("from", from);
  if (to) back.set("to", to);
  const fleetHref = back.size ? `/car?${back}` : "/car";

  const specs = [
    {
      icon: Settings2,
      label: t("detail.transmission"),
      value:
        vehicle.transmission === "AUTOMATIC"
          ? t("vehicle.automatic")
          : t("vehicle.manual"),
    },
    {
      icon: Fuel,
      label: t("detail.fuel"),
      value: t(FUEL_KEYS[vehicle.fuelType]),
    },
    { icon: Users, label: t("detail.seats"), value: `${vehicle.seats}` },
    { icon: CalendarRange, label: t("detail.year"), value: `${vehicle.year}` },
    {
      icon: Gauge,
      label: t("detail.category"),
      value: t(CATEGORY_KEYS[vehicle.category]),
    },
    {
      icon: ShieldCheck,
      label: t("detail.insurance"),
      value: t("detail.included"),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 pt-2 pb-28 lg:pt-8 lg:pb-12">
      <Link
        href={fleetHref}
        className="text-muted-foreground hover:text-foreground group mb-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium transition-colors lg:mb-5"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-[var(--motion-hover)] group-hover:-translate-x-0.5 motion-reduce:transition-none" />
        {t("detail.back")}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <div>
          <VehicleGallery
            images={vehicle.images}
            name={`${vehicle.brand} ${vehicle.model}`}
          />

          <span className="eyebrow text-muted-foreground mt-5 lg:mt-10">
            {t(CATEGORY_KEYS[vehicle.category])} · {vehicle.year}
          </span>
          <h1 className="display-lg mt-2 sm:mt-3">
            {vehicle.brand} {vehicle.model}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed sm:mt-4 sm:text-base">
            {description}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 border-t sm:mt-10 sm:grid-cols-3">
            {specs.map(({ label, value }) => (
              <div key={label} className="min-w-0 border-b py-4">
                <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
                  {label}
                </dt>
                <dd className="mt-1.5 text-base font-medium break-words">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Booking rail */}
        <aside
          id="booking"
          className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start"
        >
          <div className="border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <p className="font-display text-3xl font-semibold tabular-nums sm:text-4xl">
              {formatPrice(vehicle.pricePerDay, locale)}
              <span className="text-muted-foreground font-sans text-sm font-medium">
                {" "}
                EUR / {t("common.perDay")}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("detail.insuranceText")}
            </p>
            <AvailabilityWidget
              vehicleId={vehicle.id}
              slug={vehicle.slug}
              pricePerDay={vehicle.pricePerDay}
              initialFrom={from}
              initialTo={to}
              initialRangeAvailable={initialRangeAvailable}
              bookingCalendar={bookingCalendar}
            />
          </div>
        </aside>
      </div>

      <MobileBookingBar
        pricePerDay={vehicle.pricePerDay}
        perDayLabel={t("common.perDay")}
        bookLabel={t("common.bookVehicle")}
      />
    </div>
  );
}
