import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth/guards";
import { getVehicles } from "@/services/vehicle.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteVehicleButton } from "./delete-vehicle-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const user = await requireUser();
  const { items } = await getVehicles(
    { page: 1, perPage: 50 },
    { includeInactive: true }
  );
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vehicles</h1>
        {isAdmin && (
          <Button
            nativeButton={false}
            render={<Link href="/admin/vehicles/new" />}
          >
            Add vehicle
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Price/day</TableHead>
            {isAdmin && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((vehicle) => (
            <TableRow key={vehicle.id}>
              <TableCell>
                {vehicle.images[0] ? (
                  <Image
                    src={vehicle.images[0].url}
                    alt={`${vehicle.brand} ${vehicle.model}`}
                    width={96}
                    height={60}
                    className="h-14 w-24 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-24 items-center justify-center rounded bg-neutral-200 text-xs text-neutral-500">
                    No image
                  </div>
                )}
              </TableCell>
              <TableCell>
                <p className="font-medium">
                  {vehicle.brand} {vehicle.model}
                </p>
                <p className="text-muted-foreground text-sm">
                  {vehicle.year} - {vehicle.transmission} - {vehicle.seats}{" "}
                  seats
                </p>
              </TableCell>
              <TableCell>{vehicle.category}</TableCell>
              <TableCell>
                <StatusBadge status={vehicle.status} />
              </TableCell>
              <TableCell>
                {Number(vehicle.pricePerDay).toFixed(2)} EUR
              </TableCell>
              {isAdmin && (
                <TableCell className="text-right">
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
                    <DeleteVehicleButton vehicleId={vehicle.id} />
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
