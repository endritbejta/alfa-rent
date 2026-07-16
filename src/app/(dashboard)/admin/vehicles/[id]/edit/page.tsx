import { requireRole } from "@/lib/auth/guards";
import { getVehicleById } from "@/services/vehicle.service";
import { getVehicleFleetProfile } from "@/services/fleet.service";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { RepairsPanel } from "./repairs";
import {
  deleteVehicleAction,
  deleteVehicleImageAction,
  updateVehicleAction,
} from "../../actions";

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
    <div className="space-y-6">
      <VehicleForm
        action={updateWithId}
        vehicle={vehicle}
        onDeleteImage={deleteVehicleImageAction}
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
    </div>
  );
}
