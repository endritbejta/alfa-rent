import { requireRole } from "@/lib/auth/guards";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { createVehicleAction } from "../actions";

export default async function NewVehiclePage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Add vehicle</h1>
      <VehicleForm action={createVehicleAction} />
    </div>
  );
}
