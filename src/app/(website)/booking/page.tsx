import type { Metadata } from "next";
import { getPublicVehicles } from "@/services/vehicle.service";
import { BookingForm } from "@/components/forms/booking-form";
import { vehicleLabel } from "@/utils/vehicle";
import { getI18n } from "@/lib/i18n/server";

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
  searchParams: Promise<{ vehicle?: string; from?: string; to?: string }>;
}) {
  const { t } = await getI18n();
  const { vehicle: preselectedSlug, from, to } = await searchParams;
  const { items: vehicles } = await getPublicVehicles({
    page: 1,
    perPage: 50,
  });

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
      <section className="mx-auto max-w-2xl px-5 py-12">
        <BookingForm
          vehicles={vehicles.map((v) => ({
            id: v.id,
            slug: v.slug,
            label: `${vehicleLabel(v)} — ${Number(v.pricePerDay)} EUR/${t("common.perDay")}`,
          }))}
          preselectedSlug={preselectedSlug}
          initialFrom={from}
          initialTo={to}
        />
      </section>
    </>
  );
}
