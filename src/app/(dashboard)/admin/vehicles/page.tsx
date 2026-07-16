import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth/guards";
import {
  getVehicles,
  type VehicleWithImages,
} from "@/services/vehicle.service";
import { getFleetInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard, StatGrid } from "@/components/dashboard/stat-card";
import { Panel } from "@/components/dashboard/panel";
import { BarList } from "@/components/dashboard/bar-list";
import { ViewSwitcher } from "@/components/dashboard/view-switcher";
import { VehicleGrid } from "./vehicle-grid";
import { RecentlyAdded } from "./recently-added";
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

export const dynamic = "force-dynamic";

function VehicleTable({
  vehicles,
  isAdmin,
  dense = false,
}: {
  vehicles: VehicleWithImages[];
  isAdmin: boolean;
  dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {!dense && <TableHead>Image</TableHead>}
            <TableHead>Vehicle</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Price/day</TableHead>
            {isAdmin && <TableHead className="text-right">Actions</TableHead>}
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
                    <div className="flex h-12 w-20 items-center justify-center rounded bg-neutral-200 text-[10px] text-neutral-500">
                      No image
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
                  {!dense && ` - ${vehicle.year} - ${vehicle.seats} seats`}
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
                {Number(vehicle.pricePerDay).toFixed(2)} EUR
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
                      Edit
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

export default async function VehiclesPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const [{ items }, insights] = await Promise.all([
    getVehicles({ page: 1, perPage: 50 }, { includeInactive: true }),
    getFleetInsights(),
  ]);

  const counts = insights.statusCounts;
  const activeFleet = items.filter((v) => v.status !== "INACTIVE").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" description="Fleet overview and management">
        {isAdmin && (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/vehicles/new" />}
          >
            Add vehicle
          </Button>
        )}
      </PageHeader>

      <StatGrid className="lg:grid-cols-3">
        <StatCard label="Fleet size" value={activeFleet} />
        <StatCard label="Available" value={counts.AVAILABLE ?? 0} tone="good" />
        <StatCard label="Rented" value={counts.RENTED ?? 0} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Fleet by category" subtitle="Active vehicles">
          <BarList items={insights.categoryDistribution} />
        </Panel>
        <Panel title="Most booked" subtitle="All-time confirmed rentals">
          <BarList
            items={insights.topVehicles}
            barClassName="bg-status-rented"
          />
        </Panel>
        <Panel title="Recently added" subtitle="Latest fleet additions">
          <RecentlyAdded items={insights.recentlyAdded} />
        </Panel>
      </div>

      <ViewSwitcher
        grid={
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
                pricePerDay: String(v.pricePerDay),
                status: v.status,
                image: v.images[0]?.url ?? null,
                registrationDue: reg.state === "due",
                registrationExpired: reg.state === "expired",
              };
            })}
          />
        }
        list={<VehicleTable vehicles={items} isAdmin={isAdmin} />}
        compact={<VehicleTable vehicles={items} isAdmin={isAdmin} dense />}
      />
    </div>
  );
}
