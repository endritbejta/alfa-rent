import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPublicVehicleBySlug } from "@/services/vehicle.service";
import { getVehicleBookingCalendar } from "@/services/reservation.service";
import { BookingForm } from "@/components/forms/booking-form";
import { vehicleLabel } from "@/lib/vehicle-label";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";
import { NotFoundError } from "@/lib/errors";
import { isBookingRangeAvailable } from "@/lib/booking-calendar";

const CATEGORY_KEYS = {
  ECONOMY: "filter.economy",
  COMPACT: "filter.compact",
  SEDAN: "filter.sedan",
  SUV: "filter.suv",
  LUXURY: "filter.luxury",
  VAN: "filter.van",
} satisfies Record<string, TranslationKey>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("booking.metaTitle"),
    description: t("booking.intro"),
  };
}

export const dynamic = "force-dynamic";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    vehicle?: string;
    from?: string;
    to?: string;
    category?: string;
  }>;
}) {
  const { t } = await getI18n();
  const { vehicle: preselectedSlug, from, to, category } = await searchParams;
  const fleetParams = new URLSearchParams();
  if (from) fleetParams.set("from", from);
  if (to) fleetParams.set("to", to);
  if (category) fleetParams.set("category", category);
  const changeVehicleHref = `/car${fleetParams.size ? `?${fleetParams}` : ""}`;

  if (!preselectedSlug) redirect(changeVehicleHref);

  const vehicle = await getPublicVehicleBySlug(preselectedSlug).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }
  );
  const bookingCalendar = await getVehicleBookingCalendar(vehicle.id);
  const initialRangeAvailable = isBookingRangeAvailable(
    from,
    to,
    bookingCalendar
  );

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">
            {t("booking.eyebrow")}
          </span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            {t("booking.title")}
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">{t("booking.intro")}</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12">
        <BookingForm
          vehicle={{
            id: vehicle.id,
            label: vehicleLabel(vehicle),
            category: t(CATEGORY_KEYS[vehicle.category]),
            transmission:
              vehicle.transmission === "AUTOMATIC"
                ? t("vehicle.automatic")
                : t("vehicle.manual"),
            seats: vehicle.seats,
            pricePerDay: vehicle.pricePerDay,
            imageUrl: vehicle.images[0]?.url,
          }}
          initialFrom={from}
          initialTo={to}
          initialRangeAvailable={initialRangeAvailable}
          bookingCalendar={bookingCalendar}
          changeVehicleHref={changeVehicleHref}
        />
      </section>
    </>
  );
}
