import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
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
import { VehicleCard } from "@/components/shared/vehicle-card";
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
                {!dense && (
                  <p className="text-muted-foreground text-sm">
                    {vehicle.year} - {vehicle.transmission} - {vehicle.seats}{" "}
                    seats
                  </p>
                )}
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

      <StatGrid>
        <StatCard label="Fleet size" value={activeFleet} />
        <StatCard label="Available" value={counts.AVAILABLE ?? 0} tone="good" />
        <StatCard label="Rented" value={counts.RENTED ?? 0} />
        <StatCard
          label="Maintenance"
          value={counts.SERVICE ?? 0}
          tone={counts.SERVICE ? "warn" : "default"}
        />
        <StatCard label="Retired" value={counts.INACTIVE ?? 0} />
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
          <ul className="divide-y">
            {insights.recentlyAdded.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="font-medium">
                  {v.brand} {v.model}
                </span>
                <span className="text-muted-foreground text-xs">
                  {format(v.createdAt, "dd MMM yyyy")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <ViewSwitcher
        grid={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        }
        list={<VehicleTable vehicles={items} isAdmin={isAdmin} />}
        compact={<VehicleTable vehicles={items} isAdmin={isAdmin} dense />}
      />
    </div>
  );
}
