import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { requireUser } from "@/lib/auth/guards";
import {
  getVehicles,
  getVehicleBrands,
  type VehicleWithImages,
} from "@/services/vehicle.service";
import { adminVehicleFilterSchema } from "@/lib/validations/vehicle";
import { getFleetInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { ViewSwitcher } from "@/components/dashboard/view-switcher";
import { readView } from "@/components/dashboard/view";
import { VehicleGrid } from "./vehicle-grid";
import { VehicleFilters } from "./vehicle-filters";
import { FleetStatusFilter } from "./fleet-status-filter";
import { Pagination } from "@/components/dashboard/pagination";
import { registrationState } from "@/services/fleet.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteVehicleButton } from "./delete-vehicle-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { getI18n } from "@/lib/i18n/server";
import { formatEur, toMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

async function VehicleTable({
  vehicles,
  isAdmin,
  dense = false,
}: {
  vehicles: VehicleWithImages[];
  isAdmin: boolean;
  dense?: boolean;
}) {
  const { locale, t } = await getI18n();
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            {!dense && <TableHead>{t("admin.image")}</TableHead>}
            <TableHead>{t("admin.vehicle")}</TableHead>
            <TableHead>{t("admin.category")}</TableHead>
            <TableHead>{t("admin.status")}</TableHead>
            <TableHead className="text-right">
              {t("admin.pricePerDay")}
            </TableHead>
            {isAdmin && (
              <TableHead className="text-right">{t("admin.actions")}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((vehicle) => (
            <TableRow key={vehicle.id}>
              {!dense && (
                <TableCell>
                  {vehicle.images[0] ? (
                    <Image
                      src={vehicle.images[0].url}
                      alt={`${vehicle.brand} ${vehicle.model}`}
                      width={96}
                      height={60}
                      className="h-12 w-20 rounded object-cover"
                    />
                  ) : (
                    <div className="bg-skeleton text-muted-foreground flex h-12 w-20 items-center justify-center rounded text-[10px]">
                      {t("admin.noImage")}
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell className={cn(dense && "py-2")}>
                <p className="font-medium">
                  {vehicle.brand} {vehicle.model}
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-mono">
                    {vehicle.plate ?? String(vehicle.year)}
                  </span>
                  {!dense &&
                    ` - ${vehicle.year} - ${t("admin.seatCount", {
                      count: vehicle.seats,
                    })}`}
                </p>
              </TableCell>
              <TableCell className={cn(dense && "py-2")}>
                {vehicle.category}
              </TableCell>
              <TableCell className={cn(dense && "py-2")}>
                <StatusBadge status={vehicle.status} />
              </TableCell>
              <TableCell
                className={cn("text-right tabular-nums", dense && "py-2")}
              >
                {formatEur(vehicle.pricePerDay, locale)}
              </TableCell>
              {isAdmin && (
                <TableCell className={cn("text-right", dense && "py-2")}>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`/admin/vehicles/${vehicle.id}/edit`} />
                      }
                    >
                      {t("admin.edit")}
                    </Button>
                    {!dense && <DeleteVehicleButton vehicleId={vehicle.id} />}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const { t } = await getI18n();
  const isAdmin = user.role === "ADMIN";

  const params = await searchParams;
  // Each field falls back on its own (see the schema), so an unreadable
  // param drops only that filter — it can never silently widen the query
  // back to the whole fleet.
  const view = readView(params.view);
  const parsed = adminVehicleFilterSchema.safeParse(params);
  const filters = parsed.success
    ? parsed.data
    : adminVehicleFilterSchema.parse({});

  const [{ items, total, page, perPage, totalPages }, insights, brands] =
    await Promise.all([
      getVehicles(filters, {
        includeInactive: true,
        brand: "brand" in filters ? filters.brand : undefined,
        status: "status" in filters ? filters.status : undefined,
        registration:
          "registration" in filters ? filters.registration : undefined,
      }),
      getFleetInsights(),
      getVehicleBrands(),
    ]);

  // A stale ?page from a wider result set would strand staff on a blank
  // page; send them back to the first page of what they actually asked for.
  if (total > 0 && page > totalPages) {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        (entry): entry is [string, string] =>
          entry[0] !== "page" && entry[1] !== undefined
      )
    );
    const qs = query.toString();
    redirect(qs ? `/admin/vehicles?${qs}` : "/admin/vehicles");
  }

  return (
    <PageBody>
      <PageHeader
        title={t("admin.vehicles")}
        description={t("admin.fleetDescription")}
      >
        {isAdmin && (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/vehicles/new" />}
          >
            {t("admin.addVehicle")}
          </Button>
        )}
      </PageHeader>

      {/* Fleet-by-category and most-booked live on Analytics; duplicating
          them here pushed the fleet itself below the fold. */}
      <FleetStatusFilter counts={insights.statusCounts} />

      <VehicleFilters brands={brands} total={total} />

      {items.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-display text-lg font-bold">
            {t("admin.noVehicles")}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin.noVehiclesHint")}
          </p>
        </div>
      ) : (
        <>
          <ViewSwitcher active={view} basePath="/admin/vehicles" />
          {view === "grid" ? (
            <VehicleGrid
              items={items.map((v) => {
                const reg = registrationState(v.registrationExpiry);
                return {
                  id: v.id,
                  brand: v.brand,
                  model: v.model,
                  plate: v.plate,
                  year: v.year,
                  category: v.category,
                  transmission: v.transmission,
                  fuelType: v.fuelType,
                  seats: v.seats,
                  pricePerDay: toMoney(v.pricePerDay),
                  status: v.status,
                  image: v.images[0]?.url ?? null,
                  registrationDue: reg.state === "due",
                  registrationExpired: reg.state === "expired",
                };
              })}
            />
          ) : (
            <VehicleTable
              vehicles={items}
              isAdmin={isAdmin}
              dense={view === "compact"}
            />
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={perPage}
            basePath="/admin/vehicles"
            labelKey="common.vehicles"
          />
        </>
      )}
    </PageBody>
  );
}
