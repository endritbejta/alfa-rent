import { requireRole } from "@/lib/auth/guards";
import { getVehicleById } from "@/services/vehicle.service";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { deleteVehicleImageAction, updateVehicleAction } from "../../actions";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const vehicle = await getVehicleById(id);

  const updateWithId = updateVehicleAction.bind(null, id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        Edit {vehicle.brand} {vehicle.model}
      </h1>
      <VehicleForm
        action={updateWithId}
        vehicle={vehicle}
        onDeleteImage={deleteVehicleImageAction}
      />
    </div>
  );
}
