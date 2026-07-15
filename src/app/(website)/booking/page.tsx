import type { Metadata } from "next";
import { getVehicles } from "@/services/vehicle.service";
import { BookingForm } from "@/components/forms/booking-form";

export const metadata: Metadata = {
  title: "Book a Vehicle",
  description:
    "Request your rental in two minutes. Our team confirms within hours.",
};

export const dynamic = "force-dynamic";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; from?: string; to?: string }>;
}) {
  const { vehicle: preselectedSlug, from, to } = await searchParams;
  const { items: vehicles } = await getVehicles({ page: 1, perPage: 50 });

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">Booking</span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            Reserve your vehicle
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">
            Send the request now — you pay nothing until pickup. Our team
            confirms within business hours.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-2xl px-5 py-12">
        <BookingForm
          vehicles={vehicles.map((v) => ({
            id: v.id,
            slug: v.slug,
            label: `${v.brand} ${v.model} (${v.year}) — ${Number(v.pricePerDay)} EUR/day`,
          }))}
          preselectedSlug={preselectedSlug}
          initialFrom={from}
          initialTo={to}
        />
      </section>
    </>
  );
}
