import { requireRole } from "@/lib/auth/guards";
import { getVehicleById } from "@/services/vehicle.service";
import { getVehicleFleetProfile } from "@/services/fleet.service";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { RepairsPanel } from "./repairs";
import { deleteVehicleAction, updateVehicleAction } from "../../actions";
import { PageBody } from "@/app/(dashboard)/admin/page-body";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const [vehicle, profile] = await Promise.all([
    getVehicleById(id),
    getVehicleFleetProfile(id),
  ]);

  const updateWithId = updateVehicleAction.bind(null, id);
  const deleteWithId = deleteVehicleAction.bind(null, id);

  return (
    <PageBody>
      <VehicleForm
        action={updateWithId}
        // Decimal cannot cross into a client component — convert at the edge.
        vehicle={{
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          plate: vehicle.plate,
          year: vehicle.year,
          category: vehicle.category,
          transmission: vehicle.transmission,
          fuelType: vehicle.fuelType,
          seats: vehicle.seats,
          pricePerDay: Number(vehicle.pricePerDay),
          description: vehicle.description,
          status: vehicle.status,
          registrationDate: vehicle.registrationDate,
          registrationExpiry: vehicle.registrationExpiry,
          lastServiceDate: vehicle.lastServiceDate,
          nextServiceDate: vehicle.nextServiceDate,
          serviceNotes: vehicle.serviceNotes,
          images: vehicle.images.map((image) => ({
            id: image.id,
            url: image.url,
          })),
        }}
        onDeleteVehicle={deleteWithId}
      />

      <RepairsPanel
        vehicleId={id}
        repairs={profile.repairs.map((r) => ({
          id: r.id,
          date: r.date,
          cost: String(r.cost),
          description: r.description,
          notes: r.notes,
          reference: r.reference,
        }))}
        stats={profile.stats}
      />
    </PageBody>
  );
}
