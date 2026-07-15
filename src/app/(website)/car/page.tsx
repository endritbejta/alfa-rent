import type { Metadata } from "next";
import { format } from "date-fns";
import { getVehicles } from "@/services/vehicle.service";
import { vehicleFilterSchema } from "@/lib/validations/vehicle";
import { VehicleCard } from "@/components/shared/vehicle-card";
import { FleetFilters } from "@/components/forms/fleet-filters";

export const metadata: Metadata = {
  title: "Our Fleet",
  description:
    "Browse the Alfa Rent a Car fleet: economy, SUV, luxury and van rentals in Kosovo with transparent daily pricing.",
};

export const dynamic = "force-dynamic";

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = vehicleFilterSchema.safeParse({ ...params, perPage: 24 });
  const filters = parsed.success ? parsed.data : { page: 1, perPage: 24 };
  const { items, total } = await getVehicles(filters);

  const dateRange =
    filters.from && filters.to && filters.to > filters.from
      ? { from: filters.from, to: filters.to }
      : null;

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">Our fleet</span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            Find your drive
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">
            {dateRange
              ? `Showing vehicles available ${format(dateRange.from, "dd MMM")} - ${format(dateRange.to, "dd MMM yyyy")}.`
              : "Every vehicle, every price, up front."}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <FleetFilters />

        <p className="text-muted-foreground mt-8 mb-4 text-sm">
          {total} vehicle{total === 1 ? "" : "s"}
          {dateRange ? " available for your dates" : ""}
        </p>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="font-display text-lg font-bold">
              Nothing matches those filters
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Try widening the dates or clearing a category filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 pb-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
