import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  Users,
  Fuel,
  Settings2,
  CalendarRange,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { getPublicVehicleBySlug } from "@/services/vehicle.service";
import { NotFoundError } from "@/lib/errors";
import { StatusBadge } from "@/components/shared/status-badge";
import { AvailabilityWidget } from "@/components/forms/availability-widget";
import { MobileBookingBar } from "@/components/forms/mobile-booking-bar";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";
import { getVehicleDescription } from "@/lib/i18n/vehicle-content";

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
  const description = getVehicleDescription(vehicle, locale);
  return {
    title: `${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${Number(vehicle.pricePerDay)} EUR/${t("common.perDay")}`,
    description: description.slice(0, 155),
    openGraph: vehicle.images[0]
      ? { images: [{ url: vehicle.images[0].url }] }
      : undefined,
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
  const description = getVehicleDescription(vehicle, locale);
  const [cover, ...rest] = vehicle.images;

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
    <div className="mx-auto max-w-6xl px-5 pt-12 pb-28 lg:py-12">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {/* Gallery */}
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800">
            {cover ? (
              <Image
                src={cover.url}
                alt={`${vehicle.brand} ${vehicle.model}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-sm tracking-[0.16em] uppercase">
                {vehicle.brand} {vehicle.model}
              </span>
            )}
            <span className="absolute top-4 left-4">
              <StatusBadge status={vehicle.status} variant="overlay" />
            </span>
          </div>
          {rest.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {rest.slice(0, 4).map((image) => (
                <div
                  key={image.id}
                  className="bg-media relative aspect-[16/10] overflow-hidden rounded-lg"
                >
                  <Image
                    src={image.url}
                    alt={`${vehicle.brand} ${vehicle.model}`}
                    fill
                    sizes="15vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <span className="eyebrow text-muted-foreground mt-10">
            {t(CATEGORY_KEYS[vehicle.category])}
          </span>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-tight">
            {vehicle.brand} {vehicle.model}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl leading-relaxed">
            {description}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {specs.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="bg-card min-w-0 rounded-xl border p-3 shadow-xs sm:p-4"
              >
                <Icon className="text-brand mb-1.5 h-4 w-4 sm:mb-2 sm:h-5 sm:w-5" />
                <p className="text-muted-foreground text-[10px] leading-tight sm:text-xs">
                  {label}
                </p>
                <p className="mt-1 text-xs leading-tight font-semibold break-words sm:mt-0 sm:text-sm">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Booking rail */}
        <aside
          id="booking"
          className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start"
        >
          <div className="bg-card rounded-2xl border p-6 shadow-sm">
            <p className="font-display text-3xl font-bold">
              {Number(vehicle.pricePerDay)}
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
              initialFrom={from}
              initialTo={to}
            />
          </div>
        </aside>
      </div>

      <MobileBookingBar
        pricePerDay={Number(vehicle.pricePerDay)}
        perDayLabel={t("common.perDay")}
        bookLabel={t("common.bookVehicle")}
      />
    </div>
  );
}
