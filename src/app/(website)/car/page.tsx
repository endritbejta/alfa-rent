import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { getPublicVehicles } from "@/services/vehicle.service";
import { vehicleFilterSchema } from "@/lib/validations/vehicle";
import { VehicleCard } from "@/components/shared/vehicle-card";
import { FleetFilters } from "@/components/forms/fleet-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("fleet.metaTitle"),
    description: t("home.metaDescription"),
  };
}

export const dynamic = "force-dynamic";

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, t } = await getI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const params = await searchParams;
  const parsed = vehicleFilterSchema.safeParse({ ...params, perPage: 24 });
  const filters = parsed.success ? parsed.data : { page: 1, perPage: 24 };
  const { items, total, page, perPage, totalPages } =
    await getPublicVehicles(filters);
  if (total > 0 && page > totalPages) {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    );
    query.delete("page");
    const rest = query.toString();
    redirect(rest ? `/car?${rest}` : "/car");
  }

  const dateRange =
    filters.from && filters.to && filters.to > filters.from
      ? { from: filters.from, to: filters.to }
      : null;

  // Carry the customer's date/category selection to the detail pages.
  const forward = new URLSearchParams();
  if (params.from) forward.set("from", params.from);
  if (params.to) forward.set("to", params.to);
  if (params.category) forward.set("category", params.category);
  const query = forward.toString();

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">{t("fleet.eyebrow")}</span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            {t("fleet.title")}
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">
            {dateRange
              ? t("fleet.availableDescription", {
                  from: format(dateRange.from, "dd MMM", {
                    locale: dateLocale,
                  }),
                  to: format(dateRange.to, "dd MMM yyyy", {
                    locale: dateLocale,
                  }),
                })
              : t("fleet.defaultDescription")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <FleetFilters />

        <p className="text-muted-foreground mt-8 mb-4 text-sm">
          {t(total === 1 ? "fleet.count" : "fleet.countPlural", {
            count: total,
          })}
          {dateRange ? t("fleet.availableSuffix") : ""}
        </p>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="font-display text-lg font-bold">
              {t("fleet.emptyTitle")}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {t("fleet.emptyText")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 pb-8 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} query={query} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              perPage={perPage}
              basePath="/car"
              label="vehicles"
            />
          </>
        )}
      </section>
    </>
  );
}
